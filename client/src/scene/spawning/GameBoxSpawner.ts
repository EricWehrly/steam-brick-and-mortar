import * as THREE from 'three'
import { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { AppSettings, Setting } from '../../core/AppSettings'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
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
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)

    // Owned renderer — constructed on first BatchReadyForPlacement
    private renderer: GpuGameBoxRenderer | null = null
    private rendererInitialized = false
    private lastTotalBatches = 0

    // Games stored by batch index for prewarm tracking
    private pendingGames: Map<number, readonly SteamGameData[]> = new Map()
    // Shelf world positions indexed by batchIndex
    private shelfPositions: Map<number, ShelfPosition> = new Map()

    // Rendezvous state: prefetch result per appid (populated when prefetch settles)
    private prefetchResults: Map<number, PrefetchResult> = new Map()
    // Rendezvous state: placement intent per appid (populated during GamesSort)
    private placementIntents: Map<number, PlacementIntent> = new Map()

    private readonly labelsEnabled: boolean

    /** Expose the current renderer for external consumers (e.g. addToScene, updateLODForCamera). */
    public getRenderer(): GpuGameBoxRenderer | null {
        return this.renderer
    }

    private readonly boundHandleBatchReady: (e: CustomEvent<BatchReadyForPlacementEvent>) => void
    private readonly boundHandleShelfReady: (e: CustomEvent<ShelfReadyEvent>) => void
    private readonly boundHandleSectionsReady: (e: CustomEvent<SectionsReadyEvent>) => void

    constructor() {
        this.labelsEnabled = AppSettings.get(Setting.EnableLabels)
        this.boundHandleBatchReady = this.handleBatchReadyForPlacement.bind(this)
        this.boundHandleShelfReady = this.handleShelfReady.bind(this)
        this.boundHandleSectionsReady = this.handleSectionsReady.bind(this)

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReady
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.boundHandleShelfReady
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.SectionsReady,
            this.boundHandleSectionsReady
        )

        GameBoxSpawner.logger.debug('Registered listeners for BatchReadyForPlacement, ShelfReady, and GamesSort')
    }

    public reset(): void {
        this.renderer?.dispose()
        this.renderer = null
        this.rendererInitialized = false
        this.pendingGames.clear()
        this.shelfPositions.clear()
        this.prefetchResults.clear()
        this.placementIntents.clear()
        GameBoxSpawner.logger.debug('Reset: renderer disposed, state cleared')
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReady
        )
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.boundHandleShelfReady
        )
        EventManager.getInstance().deregisterEventHandler(
            GameEventTypes.SectionsReady,
            this.boundHandleSectionsReady
        )
        this.renderer?.dispose()
        this.renderer = null
    }

    // -------------------------------------------------------------------------
    // Phase 1: prewarm artwork as batches arrive

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        if (!this.rendererInitialized || totalBatches !== this.lastTotalBatches) {
            if (this.renderer) {
                GameBoxSpawner.logger.debug(
                    `Batch count changed (${this.lastTotalBatches} → ${totalBatches}) — replacing renderer`
                )
                this.renderer.dispose()
            }
            const estimatedGames = totalBatches * 18
            this.renderer = new GpuGameBoxRenderer(estimatedGames + 100)
            this.rendererInitialized = true
            this.lastTotalBatches = totalBatches
        }

        GameBoxSpawner.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        this.pendingGames.set(batchIndex, games)

        for (const game of games) {
            const appid = typeof game.appid === 'number' ? game.appid : 0
            const artworkUrl = this.selectBestArtworkUrl(game as SteamGameData)

            if (!artworkUrl) {
                // No URL possible — record as permanent failure so tryPlace falls through to label
                this.prefetchResults.set(appid, 'permanent-failure')
                this.tryPlace(appid)
                continue
            }

            this.renderer!.prefetchArtwork(appid, artworkUrl, game.name).then((result) => {
                this.prefetchResults.set(appid, result)
                this.tryPlace(appid)
            }).catch((error) => {
                GameBoxSpawner.logger.warn(`prefetchArtwork failed for "${game.name}": ${error}`)
                this.prefetchResults.set(appid, 'error')
                this.tryPlace(appid)
            })
            // Promise reference is not stored — it GCs after .then() is attached.
        }
    }

    // -------------------------------------------------------------------------
    // Cache shelf positions from ShelfReady events

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { batchIndex, position, rotationY } = event.detail
        this.shelfPositions.set(batchIndex, {
            position: (position as THREE.Vector3).clone(),
            rotationY
        })
        GameBoxSpawner.logger.debug(
            `ShelfReady: cached position for batch ${batchIndex} ` +
            `(${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )
    }

    // -------------------------------------------------------------------------
    // Phase 2: assign placement intents across all sections, place what's ready

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

        this.renderer.clearPlacements()
        this.placementIntents.clear()

        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) {
            GameBoxSpawner.logger.warn('SectionsReady: no shelf surfaces found')
            return
        }

        // Walk shelf positions in batchIndex order; distribute sections sequentially.
        const sortedBatchIndices = [...this.shelfPositions.keys()].sort((a, b) => a - b)
        let batchIndexCursor = 0

        for (const section of sections) {
            const gameQueue = [...section.games] as SteamGameData[]

            while (gameQueue.length > 0 && batchIndexCursor < sortedBatchIndices.length) {
                const batchIndex = sortedBatchIndices[batchIndexCursor]
                const shelfPos = this.shelfPositions.get(batchIndex)!
                const gamesForShelf = this.gamesPerShelf(shelfSurfaces)
                const batch = gameQueue.splice(0, gamesForShelf)
                this.assignIntentsOnShelf(shelfPos, shelfSurfaces, batch)

                EventManager.getInstance().emit<GamesPlacedEvent>(
                    StorePropsEventTypes.GamesPlaced,
                    { batchIndex, status: BatchProcessingStatus.GamesPlaced }
                )
                batchIndexCursor++
            }
        }

        GameBoxSpawner.logger.debug(
            `SectionsReady: ${this.placementIntents.size} intents assigned across ${batchIndexCursor} shelves`
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

    private assignIntentsOnShelf(
        shelf: ShelfPosition,
        surfaces: ShelfSurface[],
        games: SteamGameData[]
    ): void {
        const boxDimensions = { width: 0.3, height: 0.4, depth: 0.08 }
        let gameIndex = 0

        for (const surface of surfaces) {
            if (gameIndex >= games.length) break

            const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (backGames.length > 0) {
                this.assignIntentsForRow(shelf, surface, backGames, ShelfSide.Back, boxDimensions)
                gameIndex += backGames.length
            }

            if (gameIndex < games.length) {
                const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (frontGames.length > 0) {
                    this.assignIntentsForRow(shelf, surface, frontGames, ShelfSide.Front, boxDimensions)
                    gameIndex += frontGames.length
                }
            }
        }
    }

    private assignIntentsForRow(
        shelf: ShelfPosition,
        surface: ShelfSurface,
        games: SteamGameData[],
        side: ShelfSide,
        boxDimensions: { width: number; height: number; depth: number }
    ): void {
        const positions = GameBoxUtils.calculateGamePositions(
            shelf.position, surface, games, side, boxDimensions, shelf.rotationY
        )
        const rotation = GameBoxUtils.calculateGameRotation(shelf.rotationY, side)

        for (let i = 0; i < games.length; i++) {
            const game = games[i]
            const appid = typeof game.appid === 'number' ? game.appid : 0
            this.placementIntents.set(appid, {
                game,
                position: positions[i],
                rotation,
            })
            this.tryPlace(appid)
        }
    }

    private gamesPerShelf(surfaces: ShelfSurface[]): number {
        return surfaces.length * GameLayoutConstants.GAMES_PER_SURFACE * 2
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
