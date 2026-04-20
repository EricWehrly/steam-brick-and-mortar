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
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type GamesPlacedEvent,
} from '../../types/InteractionEvents'
import type { SectionsReadyEvent } from '../../types/EnvironmentEvents'
import { Logger } from '../../utils/Logger'

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
 *   Constructs the renderer on the first batch (deferred until maxGames is known).
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

    // Owned renderer — constructed when sections are known (total game count drives allocation)
    private renderer: GpuGameBoxRenderer | null = null

    // Shelf world positions indexed by shelfIndex, grouped by sectionIndex
    private shelfPositions: Map<number, ShelfPosition & { sectionIndex: number }> = new Map()

    // Rendezvous state: prefetch result per appid (populated when prefetch settles)
    private prefetchResults: Map<number, PrefetchResult> = new Map()
    // Rendezvous state: placement intent per appid (populated during SectionsReady)
    private placementIntents: Map<number, PlacementIntent> = new Map()

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
            StorePropsEventTypes.ClearRequest,
            () => this.reset()
        )

        GameBoxSpawner.logger.debug('Constructed')
    }

    private reset(): void {
        this.renderer?.dispose()
        this.renderer = null
        this.stockStrategy = null
        this.shelfPositions.clear()
        this.prefetchResults.clear()
        this.placementIntents.clear()
        GameBoxSpawner.logger.debug('Reset')
    }

    // -------------------------------------------------------------------------
    // Receive stock strategy + construct renderer from ShelfLayoutDetermined

    private handleLayoutDetermined(event: CustomEvent<ShelfLayoutDeterminedEvent>): void {
        this.stockStrategy = event.detail.stockStrategy
        GameBoxSpawner.logger.debug('Stock strategy updated from ShelfLayoutDetermined')
    }

    // -------------------------------------------------------------------------
    // Phase 1: prewarm artwork as batches arrive (independent of shelf layout)

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        // Construct renderer on first batch using total game estimate.
        // Renderer is replaced if batch count changes (library reload).
        if (!this.renderer || totalBatches * 18 + 100 > (this.renderer as any)._capacity) {
            this.renderer?.dispose()
            this.renderer = new GpuGameBoxRenderer(totalBatches * 18 + 100)
        }

        GameBoxSpawner.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
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
    // Phase 2: assign placement intents per section using section-tagged shelves

    private handleSectionsReady(event: CustomEvent<SectionsReadyEvent>): void {
        const { sections } = event.detail
        const totalGames = sections.reduce((sum, s) => sum + s.games.length, 0)

        GameBoxSpawner.logger.debug(
            `SectionsReady: ${sections.length} section(s), ${totalGames} games total`
        )

        if (!this.renderer) {
            GameBoxSpawner.logger.warn('SectionsReady: renderer not yet constructed — no batches received yet')
            return
        }

        if (!this.stockStrategy) {
            GameBoxSpawner.logger.warn('SectionsReady: stock strategy not yet received — ShelfLayoutDetermined has not fired')
            return
        }

        this.renderer.clearPlacements()
        this.placementIntents.clear()

        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) {
            GameBoxSpawner.logger.warn('SectionsReady: no shelf surfaces found')
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
     * - a placement intent exists (position assigned by GamesSort)
     *
     * Called from both sides of the rendezvous — whichever arrives last wins.
     */
    private tryPlace(appid: number): void {
        if (!this.renderer) return
        const result = this.prefetchResults.get(appid)
        if (result === undefined) return // prefetch not yet settled
        const intent = this.placementIntents.get(appid)
        if (!intent) return // no position assigned yet

        this.placementIntents.delete(appid) // consume the intent
        this.renderer.placeGame(intent.game, intent.position, intent.rotation)
    }

    // -------------------------------------------------------------------------
    // Intent assignment helpers

    private assignIntentsFromStock(
        stockSurfaces: import('../../types/LayoutTypes').StockSurface[],
        games: SteamGameData[]
    ): void {
        const intents = GameBoxUtils.stockSurfaces(stockSurfaces, games)
        for (const { game, position, rotation } of intents) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.placementIntents.set(appid, { game, position, rotation })
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

