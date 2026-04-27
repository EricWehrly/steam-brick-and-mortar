import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, GameBoxUtils, GameLayoutConstants, type IStockStrategy } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { AppSettings, Setting } from '../../core/AppSettings'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    GameEventTypes,
    SteamEventTypes,
    UIEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type GamesPlacedEvent,
} from '../../types/InteractionEvents'
import type { SectionsReadyEvent } from '../../types/EnvironmentEvents'
import type { SteamLibraryManifestReadyEvent } from '../../types/InteractionEvents'
import type {
    StorePropsLibraryReloadRequestEvent,
} from '../props/PropsEvents'
import { Logger } from '../../utils/Logger'
import type { StockSurface } from '../../types/LayoutTypes'

interface ShelfPosition {
    position: THREE.Vector3
    rotationY: number
}

/** Placement intent: where a game should appear once its artwork is ready. */
interface PlacementIntent {
    game: SteamGameData
    position: THREE.Vector3
    rotation: THREE.Quaternion
}

type PrefetchResult = 'prefetched' | 'cached' | 'permanent-failure' | 'error'

/**
 * GameBoxSpawner
 *
 * Owns the GpuGameBoxRenderer lifecycle and coordinates the two-phase load/place split:
 *
 * Phase 1 — Prewarm (BatchReadyForPlacement):
 *   Triggers artwork prefetch for each game — no GPU instances placed yet.
 *   When a prefetch settles, calls tryPlace() which places immediately if a
 *   position intent is already known.
 *
 * Phase 2 — Place (SectionsReady):
 *   Clears all existing placements, populates placement intents in sorted order
 *   across all sections, and calls tryPlace() for any game whose prefetch has
 *   already settled. Games still in-flight are placed by their prefetch .then()
 *   when it resolves.
 *
 * ShelfReady:
 *   Caches shelf positions indexed by batchIndex for Phase 2 lookup.
 *
 * The artwork/label decision is NOT made here. GpuGameBoxRenderer.placeGame()
 * checks the atlas and falls through to a label box on miss. GameBoxSpawner
 * only knows "game X goes at position Y".
 *
 * TD: This class conflates two concerns — artwork prefetch/prewarm (Phase 1) and
 * geometry-driven placement (Phase 2). They share only the renderer reference.
 * Consider splitting into ArtworkPrewarmer and GamePlacementCoordinator once
 * section-per-layout work settles the placement interface.
 */
export class GameBoxSpawner {
    private static readonly logger = Logger.createLogFunctions(GameBoxSpawner.name)

    // Owned renderer — initialized on GameDataReady (sized to full library), lives for library lifetime.
    // Cleared but NOT disposed on layout/group/sort switches.
    private renderer: GpuGameBoxRenderer | null = null

    // Shelf world positions indexed by shelfIndex, grouped by sectionIndex
    private shelfPositions: Map<number, ShelfPosition & { sectionIndex: number }> = new Map()

    // Cached sections from last SectionsReady — consumed when ShelfLayoutDetermined fires
    private pendingSections: SectionsReadyEvent | null = null

    // Rendezvous state: prefetch result per appid (populated when prefetch settles)
    private prefetchResults: Map<number, PrefetchResult> = new Map()
    // Keep app name for consolidated fallback diagnostics
    private appNamesByAppId: Map<number, string> = new Map()
    // Ensure expected fallback summary logs once per library load
    private hasLoggedExpectedFallbackSummary = false
    // Rendezvous state: placement intents per appid (one game can appear in multiple sections)
    private placementIntents: Map<number, PlacementIntent[]> = new Map()

    private readonly labelsEnabled: boolean
    private stockStrategy: IStockStrategy | null = null

    /** Expose the current renderer for external consumers (e.g. addToScene, updateLODForCamera). */
    public getRenderer(): GpuGameBoxRenderer | null {
        return this.renderer
    }

    static {
        new GameBoxSpawner()
    }

    private constructor() {
        this.labelsEnabled = AppSettings.get(Setting.EnableLabels)

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (e: CustomEvent<BatchReadyForPlacementEvent>) => this.handleBatchReadyForPlacement(e)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(e)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ShelfLayoutDetermined,
            (e: CustomEvent<ShelfLayoutDeterminedEvent>) => this.handleLayoutDetermined(e)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            (e: CustomEvent<SectionsReadyEvent>) => this.handleSectionsReady(e)
        )
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.LibraryManifestReady,
            (e: CustomEvent<SteamLibraryManifestReadyEvent>) => this.handleLibraryManifestReady(e)
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            () => this.geometryReset()
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            (e: CustomEvent<StorePropsLibraryReloadRequestEvent>) => this.handleLibraryReloadRequest(e)
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.ArtworkSettled,
            (event: CustomEvent) => this.handleArtworkSettled(event)
        )

        GameBoxSpawner.logger.debug('Constructed')
    }

    /**
     * Full teardown — only on library reload (new user, force-refresh).
     * Disposes the renderer and clears all prefetch state.
     */
    private fullReset(): void {
        this.renderer?.dispose()
        this.renderer = null
        this.stockStrategy = null
        this.pendingSections = null
        this.shelfPositions.clear()
        this.prefetchResults.clear()
        this.appNamesByAppId.clear()
        this.hasLoggedExpectedFallbackSummary = false
        this.placementIntents.clear()
        GameBoxSpawner.logger.debug('Full reset (library reload)')
    }

    /**
     * Geometry reset — on layout/group/sort switches.
     * Keeps the renderer and prefetch cache; only clears placement state.
     */
    private geometryReset(): void {
        this.renderer?.clearPlacements()
        this.stockStrategy = null
        this.pendingSections = null
        this.shelfPositions.clear()
        this.placementIntents.clear()
        GameBoxSpawner.logger.debug('Geometry reset (layout switch)')
    }

    private handleLibraryReloadRequest(_event: CustomEvent<StorePropsLibraryReloadRequestEvent>): void {
        this.fullReset()
    }

    // -------------------------------------------------------------------------
    // Initialize renderer at library load time (sized to full library)

    private initializeRendererForLibrary(totalGames: number): void {
        if (this.renderer) {
            return
        }

        const rendererCapacity = Math.max(totalGames, 1) + 100
        this.renderer = new GpuGameBoxRenderer(rendererCapacity)
        GameBoxSpawner.logger.debug(`Renderer initialized: capacity ${rendererCapacity}`)
    }

    private handleLibraryManifestReady(event: CustomEvent<SteamLibraryManifestReadyEvent>): void {
        const { totalGames } = event.detail
        this.initializeRendererForLibrary(totalGames)
    }

    // -------------------------------------------------------------------------
    // Receive stock strategy + trigger placement once shelves are known

    private handleLayoutDetermined(event: CustomEvent<ShelfLayoutDeterminedEvent>): void {
        this.stockStrategy = event.detail.stockStrategy
        GameBoxSpawner.logger.debug('Stock strategy received from ShelfLayoutDetermined')

        // If SectionsReady already arrived, place now
        if (this.pendingSections) {
            this.placeSections(this.pendingSections)
            this.pendingSections = null
        }
    }

    // -------------------------------------------------------------------------
    // Phase 1: prewarm artwork as batches arrive (independent of shelf layout)

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        GameBoxSpawner.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        if (!this.renderer) {
            GameBoxSpawner.logger.warn(
                'BatchReadyForPlacement received before GameDataReady initialized renderer — dropping batch prewarm to enforce event ordering'
            )
            return
        }

        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.appNamesByAppId.set(appid, game.name)
            const artworkUrl = this.selectBestArtworkUrl(game as SteamGameData)

            if (!artworkUrl) {
                this.prefetchResults.set(appid, 'permanent-failure')
                this.tryPlace(appid)
                continue
            }

            this.renderer.prefetchArtwork(appid, artworkUrl, game.name).then((result) => {
                this.prefetchResults.set(appid, result)
                this.tryPlace(appid)
            }).catch((error) => {
                GameBoxSpawner.logger.warn(`prefetchArtwork failed for "${game.name}": ${error}`)
                this.prefetchResults.set(appid, 'error')
                this.tryPlace(appid)
            })
        }
    }

    // -------------------------------------------------------------------------
    // Cache shelf positions from ShelfReady events

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { shelfIndex, sectionIndex, position, rotationY } = event.detail
        this.shelfPositions.set(shelfIndex, {
            position: (position as THREE.Vector3).clone(),
            rotationY,
            sectionIndex,
        })
        GameBoxSpawner.logger.debug(
            `ShelfReady: shelf ${shelfIndex} (section ${sectionIndex}) at ` +
            `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )
    }

    // -------------------------------------------------------------------------
    // Phase 2: cache sections, place when strategy is available

    private handleSectionsReady(event: CustomEvent<SectionsReadyEvent>): void {
        // Start-of-run reset: this is deterministic regardless of listener order on
        // UI-triggering events (layout/group/sort changes).
        this.shelfPositions.clear()
        this.placementIntents.clear()

        // Cache sections for placement. Placement is deferred to handleLayoutDetermined,
        // which runs after ShelfReady has repopulated fresh shelf positions.
        this.pendingSections = event.detail
        GameBoxSpawner.logger.debug('SectionsReady: cleared stale positions, waiting for ShelfLayoutDetermined')
    }

    private placeSections(detail: SectionsReadyEvent): void {
        const { sections } = detail
        const totalGames = sections.reduce((sum, s) => sum + s.games.length, 0)

        GameBoxSpawner.logger.debug(
            `Placing ${totalGames} games across ${sections.length} section(s)`
        )

        if (!this.renderer) {
            GameBoxSpawner.logger.warn('placeSections: renderer not yet constructed')
            return
        }

        if (!this.stockStrategy) {
            GameBoxSpawner.logger.warn('placeSections: no stock strategy')
            return
        }

        this.renderer.clearPlacements()
        this.placementIntents.clear()

        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) {
            GameBoxSpawner.logger.warn('placeSections: no shelf surfaces found')
            return
        }

        let shelvesUsed = 0
        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
            const section = sections[sectionIndex]
            const sectionShelves = [...this.shelfPositions.entries()]
                .filter(([, shelf]) => shelf.sectionIndex === sectionIndex)
                .sort(([a], [b]) => a - b)

            const gameQueue = [...section.games] as SteamGameData[]
            for (const [shelfIndex, shelfPos] of sectionShelves) {
                if (gameQueue.length === 0) break
                const stockSurfaces = GameBoxUtils.buildStockSurfaces(
                    shelfPos.position, shelfPos.rotationY, shelfSurfaces, { strategy: this.stockStrategy }
                )
                const shelfCapacity = stockSurfaces.reduce((sum, s) => sum + s.capacity, 0)
                const batch = gameQueue.splice(0, shelfCapacity)
                this.assignIntentsFromStock(stockSurfaces, batch)
                EventManager.getInstance().emit<GamesPlacedEvent>(
                    StorePropsEventTypes.GamesPlaced,
                    { batchIndex: shelfIndex, status: BatchProcessingStatus.GamesPlaced }
                )
                shelvesUsed++
            }

            if (gameQueue.length > 0) {
                GameBoxSpawner.logger.warn(
                    `Section "${section.name}": ${gameQueue.length} games had no shelf space`
                )
            }
        }

        GameBoxSpawner.logger.debug(
            `Placement complete: ${this.placementIntents.size} intents across ${shelvesUsed} shelves`
        )
    }

    /**
    * Attempt to place a game. Succeeds only when both conditions are met:
    * - prefetch has settled (result in prefetchResults)
    * - one or more placement intents exist (positions assigned by section placement)
     *
     * Called from both sides of the rendezvous — whichever arrives last wins.
     */
    private tryPlace(appid: number): void {
        if (!this.renderer) return
        const result = this.prefetchResults.get(appid)
        if (result === undefined) return // prefetch not yet settled
        const intents = this.placementIntents.get(appid)
        if (!intents || intents.length === 0) return // no position assigned yet

        while (intents.length > 0) {
            const intent = intents.shift()
            if (!intent) {
                break
            }

            // Expected fallback path: artwork unavailable. Place label directly and
            // avoid per-title atlas-miss warnings from deep renderer layers.
            if (result === 'permanent-failure' || result === 'error') {
                this.renderer.placeLabelBox(intent.game, intent.position, intent.rotation)
                continue
            }

            // Invariant path: prefetch says artwork exists/cached, so a miss in
            // placeGame() is a real ordering/consistency signal and should remain visible.
            this.renderer.placeGame(intent.game, intent.position, intent.rotation)
        }

        if (intents.length === 0) {
            this.placementIntents.delete(appid)
        }
    }

    // -------------------------------------------------------------------------
    // Intent assignment helpers

    private handleArtworkSettled(_event: CustomEvent): void {
        if (this.hasLoggedExpectedFallbackSummary) {
            return
        }

        const fallbackTitles: string[] = []
        for (const [appid, result] of this.prefetchResults) {
            if (result !== 'permanent-failure' && result !== 'error') {
                continue
            }
            const title = this.appNamesByAppId.get(appid)
            if (title) {
                fallbackTitles.push(title)
            }
        }

        if (fallbackTitles.length > 0) {
            fallbackTitles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            const previewLimit = 25
            const preview = fallbackTitles.slice(0, previewLimit)
            const remaining = fallbackTitles.length - preview.length
            const overflowSuffix = remaining > 0 ? ` (+${remaining} more)` : ''

            GameBoxSpawner.logger.info(
                `Artwork fallback summary: ${fallbackTitles.length} game(s) will use labels this run: ` +
                `${preview.join(', ')}${overflowSuffix}`
            )
        }

        this.hasLoggedExpectedFallbackSummary = true
    }

    private assignIntentsFromStock(
        stockSurfaces: StockSurface[],
        games: SteamGameData[]
    ): void {
        const intents = GameBoxUtils.stockSurfaces(stockSurfaces, games)
        for (const { game, position, rotation } of intents) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            const pendingIntents = this.placementIntents.get(appid) ?? []
            pendingIntents.push({ game, position, rotation })
            this.placementIntents.set(appid, pendingIntents)
            this.tryPlace(appid)
        }
    }

    /**
     * Resolve the best available artwork URL for a game.
     *
     * Priority:
     *  1. Metadata library URL (portrait, ideal for game boxes)
     *  2. Metadata header URL (landscape, fallback)
     *  3. Constructed CDN portrait URL (last resort when metadata is absent)
     */
    private selectBestArtworkUrl(game: SteamGameData): string | undefined {
        if (game.artwork?.library) return game.artwork.library
        if (game.artwork?.header) return game.artwork.header
        if (game.appid) {
            return `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
        }
        return undefined
    }
}

// Construct at import � registers event handlers for app lifetime.

