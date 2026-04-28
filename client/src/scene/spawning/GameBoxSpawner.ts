import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, GameBoxUtils, type IStockStrategy } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { 
    BatchProcessingStatus,
    GameRenderEventTypes,
    StorePropsEventTypes, 
    GameEventTypes,
    SteamEventTypes,
    UIEventTypes,
    type PlacementIntentReadyEvent,
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

/**
 * GameBoxSpawner
 *
 * Owns the GpuGameBoxRenderer lifecycle and coordinates the two-phase load/place split:
 *
 * Phase 1 — Prewarm (BatchReadyForPlacement):
 *   GpuGameBoxRenderer (via ArtworkPrefetchCoordinator) handles artwork prefetch.
 *   GameBoxSpawner does not participate in Phase 1.
 *
 * Phase 2 — Place (SectionsReady):
 *   Clears all existing placements and emits placement intents in sorted order
 *   across all sections. Renderer-side rendezvous decides textured vs label
 *   placement when artwork outcomes settle.
 *
 * ShelfReady:
 *   Caches shelf positions indexed by batchIndex for Phase 2 lookup.
 *
 * The artwork/label decision is NOT made here. GameBoxSpawner only emits
 * world-space placement intents ("game X goes at position Y").
 */
export class GameBoxSpawner {
    private static readonly logger = Logger.createLogFunctions(GameBoxSpawner.name)

    // Owned renderer — initialized on GameDataReady (sized to full library), lives for library lifetime.
    // Cleared but NOT disposed on layout/group/sort switches.
    private renderer: GpuGameBoxRenderer | null = null

    // Shelf world positions indexed by shelfIndex, grouped by sectionIndex
    private shelfPositions: Map<number, ShelfPosition & { sectionIndex: number }> = new Map()

    // Cached sections from last SectionsReady until all placement preconditions are satisfied
    private pendingSections: SectionsReadyEvent | null = null

    private stockStrategy: IStockStrategy | null = null
    private sectionsReadyCount = 0
    private layoutDeterminedCount = 0

    static {
        new GameBoxSpawner()
    }

    private constructor() {
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
        this.clearPlacementState()
        this.sectionsReadyCount = 0
        this.layoutDeterminedCount = 0
        GameBoxSpawner.logger.debug('Full reset (library reload)')
    }

    /**
     * Geometry reset — on layout/group/sort switches.
     * Keeps the renderer and prefetch cache; only clears placement state.
     */
    private geometryReset(): void {
        this.renderer?.clearPlacements()
        this.stockStrategy = null
        this.clearPlacementState()
        this.sectionsReadyCount = 0
        this.layoutDeterminedCount = 0
        GameBoxSpawner.logger.debug('Geometry reset (layout switch)')
    }

    /**
     * Clear all placement-related state.
     * Invoked on geometry resets and run boundaries.
     * Stock strategy persists across run boundaries until layout changes.
     */
    private clearPlacementState(): void {
        this.pendingSections = null
        this.shelfPositions.clear()
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

        const textureCapacity = Math.max(totalGames, 1) + 100
        const placementCapacity = Math.max(textureCapacity + 100, Math.ceil(textureCapacity * 2))
        this.renderer = new GpuGameBoxRenderer(textureCapacity, placementCapacity)
        GameBoxSpawner.logger.debug(
            `Renderer initialized: textureCapacity=${textureCapacity}, placementCapacity=${placementCapacity}`
        )
    }

    private handleLibraryManifestReady(event: CustomEvent<SteamLibraryManifestReadyEvent>): void {
        const { totalGames } = event.detail
        this.initializeRendererForLibrary(totalGames)
    }

    // -------------------------------------------------------------------------
    // Receive stock strategy + trigger placement once shelves are known

    private handleLayoutDetermined(event: CustomEvent<ShelfLayoutDeterminedEvent>): void {
        this.stockStrategy = event.detail.stockStrategy
        this.layoutDeterminedCount++
        GameBoxSpawner.logger.debug('Stock strategy received from ShelfLayoutDetermined')

        this.tryPlacePendingSections()
    }

    // -------------------------------------------------------------------------
    // Cache shelf positions from ShelfReady events

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { shelfIndex, sectionIndex, position, rotationY } = event.detail
        this.cacheShelfPosition(shelfIndex, sectionIndex, position, rotationY)
    }

    /**
     * Cache shelf position for placement lookup.
     * Clears old positions when a new wave starts (shelfIndex === 0).
     * Ensures only current-run positions are used regardless of event ordering.
     */
    private cacheShelfPosition(
        shelfIndex: number,
        sectionIndex: number,
        position: THREE.Vector3,
        rotationY: number
    ): void {
        // ShelfLayoutCoordinator emits a contiguous shelf wave per run starting at index 0.
        if (shelfIndex === 0) {
            this.shelfPositions.clear()
        }

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
        this.sectionsReadyCount++

        // Cache sections for placement. Placement can be triggered by either
        // ShelfLayoutDetermined (normal order) or SectionsReady (if layout already arrived).
        this.pendingSections = event.detail
        GameBoxSpawner.logger.debug('SectionsReady: cached sections for placement attempt')

        if (this.isLayoutReadyForPendingSections()) {
            this.tryPlacePendingSections()
        }
    }

    private isLayoutReadyForPendingSections(): boolean {
        return this.layoutDeterminedCount >= this.sectionsReadyCount
    }

    private canPlacePendingSections(): boolean {
        if (!this.pendingSections) {
            return false
        }

        if (!this.renderer) {
            GameBoxSpawner.logger.warn('tryPlacePendingSections: renderer not yet constructed')
            return false
        }

        if (!this.stockStrategy) {
            GameBoxSpawner.logger.warn('tryPlacePendingSections: no stock strategy')
            return false
        }

        if (this.shelfPositions.size === 0) {
            GameBoxSpawner.logger.debug('tryPlacePendingSections: waiting for shelf positions')
            return false
        }

        return true
    }

    private tryPlacePendingSections(): void {
        if (!this.canPlacePendingSections()) {
            return
        }

        this.placeSections(this.pendingSections)
        this.pendingSections = null
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
            `Placement intents emitted across ${shelvesUsed} shelves`
        )
    }

    // -------------------------------------------------------------------------
    // Intent assignment helpers

    private assignIntentsFromStock(
        stockSurfaces: StockSurface[],
        games: SteamGameData[]
    ): void {
        const intents = GameBoxUtils.stockSurfaces(stockSurfaces, games)
        for (const { game, position, rotation } of intents) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            EventManager.getInstance().emit<PlacementIntentReadyEvent>(
                GameRenderEventTypes.PlacementIntentReady,
                { appid, game, position, rotation }
            )
        }
    }

}

// Construct at import: registers event handlers for app lifetime.

