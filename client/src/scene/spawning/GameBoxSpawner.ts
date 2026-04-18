import * as THREE from 'three'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent,
} from '../../types/InteractionEvents'
import type { GamesSortEvent } from '../../types/EnvironmentEvents'
import type { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import { Logger } from '../../utils/Logger'

interface ShelfPosition {
    position: THREE.Vector3
    rotationY: number
}

/**
 * GameBoxSpawner
 *
 * Coordinates the two-phase load/place split for game boxes:
 *
 * Phase 1 — Prewarm (BatchReadyForPlacement):
 *   Triggers artwork prefetch for each game as batches arrive.
 *   No GPU instances placed yet — positions not known.
 *
 * Phase 2 — Place (GamesSort):
 *   Clears all existing instance placements, then iterates the sorted game
 *   list and places each game at its shelf position.
 *   This is the single moment that arranges boxes; re-sorts are free because
 *   textures are already in the atlas.
 *
 * ShelfReady:
 *   Caches shelf positions indexed by batchIndex so Phase 2 can look them up.
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)

    // Games stored by batch index for prewarm tracking
    private pendingGames: Map<number, readonly SteamGameData[]> = new Map()
    // Shelf world positions indexed by batchIndex, populated from ShelfReady events
    private shelfPositions: Map<number, ShelfPosition> = new Map()
    // Set by GpuStorePropsRenderer after renderer construction
    private renderer: GpuGameBoxRenderer | null = null

    public setRenderer(renderer: GpuGameBoxRenderer | null): void {
        this.renderer = renderer
    }

    private readonly boundHandleBatchReady: (e: CustomEvent<BatchReadyForPlacementEvent>) => void
    private readonly boundHandleShelfReady: (e: CustomEvent<ShelfReadyEvent>) => void
    private readonly boundHandleGamesSort: (e: CustomEvent<GamesSortEvent>) => void

    constructor() {
        this.boundHandleBatchReady = this.handleBatchReadyForPlacement.bind(this)
        this.boundHandleShelfReady = this.handleShelfReady.bind(this)
        this.boundHandleGamesSort = this.handleGamesSort.bind(this)

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleBatchReady
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.boundHandleShelfReady
        )
        EventManager.getInstance().registerEventHandler(
            GameEventTypes.GamesSort,
            this.boundHandleGamesSort
        )

        GameBoxSpawner.logger.debug('Registered listeners for BatchReadyForPlacement, ShelfReady, and GamesSort')
    }

    public reset(): void {
        this.pendingGames.clear()
        this.shelfPositions.clear()
        GameBoxSpawner.logger.debug('Reset pending games and shelf positions')
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
            GameEventTypes.GamesSort,
            this.boundHandleGamesSort
        )
    }

    // -------------------------------------------------------------------------
    // Phase 1: prewarm artwork as batches arrive

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        GameBoxSpawner.logger.debug(
            `BatchReadyForPlacement: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — prewarming artwork`
        )

        this.pendingGames.set(batchIndex, games)

        const renderer = this.getRenderer()
        if (!renderer) return

        for (const game of games) {
            // Fire-and-forget: prewarm does not need to complete before placement.
            renderer.prewarmGame(game as SteamGameData).catch((error) => {
                GameBoxSpawner.logger.warn(`prewarmGame failed for "${game.name}": ${error}`)
            })
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
    // Phase 2: place all games in sorted order

    private handleGamesSort(event: CustomEvent<GamesSortEvent>): void {
        const { sortedGames } = event.detail

        GameBoxSpawner.logger.debug(`GamesSort: placing ${sortedGames.length} games in sorted order`)

        const renderer = this.getRenderer()
        if (!renderer) {
            GameBoxSpawner.logger.warn('GamesSort: no renderer available, skipping placement')
            return
        }

        renderer.clearPlacements()

        // Distribute sortedGames across cached shelf positions in the same layout
        // logic used by the original spawner.
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) {
            GameBoxSpawner.logger.warn('GamesSort: no shelf surfaces found')
            return
        }

        // Walk shelf positions in batchIndex order; assign sorted games sequentially.
        const sortedBatchIndices = [...this.shelfPositions.keys()].sort((a, b) => a - b)
        const gameQueue = [...sortedGames] as SteamGameData[]

        let placed = 0
        for (const batchIndex of sortedBatchIndices) {
            if (gameQueue.length === 0) break
            const shelfPos = this.shelfPositions.get(batchIndex)!
            const gamesForShelf = this.gamesPerShelf(shelfSurfaces)
            const batch = gameQueue.splice(0, gamesForShelf)
            placed += this.placeGamesOnShelf(renderer, shelfPos, shelfSurfaces, batch)

            EventManager.getInstance().emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                { batchIndex, status: BatchProcessingStatus.GamesPlaced }
            )
        }

        GameBoxSpawner.logger.debug(`GamesSort: placed ${placed} games across ${sortedBatchIndices.length} shelves`)
    }

    private gamesPerShelf(surfaces: ShelfSurface[]): number {
        return surfaces.length * GameLayoutConstants.GAMES_PER_SURFACE * 2
    }

    private placeGamesOnShelf(
        renderer: GpuGameBoxRenderer,
        shelf: ShelfPosition,
        surfaces: ShelfSurface[],
        games: SteamGameData[]
    ): number {
        const boxDimensions = { width: 0.3, height: 0.4, depth: 0.08 }
        let gameIndex = 0
        let placed = 0

        for (const surface of surfaces) {
            if (gameIndex >= games.length) break

            const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (backGames.length > 0) {
                placed += this.placeRow(renderer, shelf, surface, backGames, ShelfSide.Back, boxDimensions)
                gameIndex += backGames.length
            }

            if (gameIndex < games.length) {
                const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (frontGames.length > 0) {
                    placed += this.placeRow(renderer, shelf, surface, frontGames, ShelfSide.Front, boxDimensions)
                    gameIndex += frontGames.length
                }
            }
        }

        return placed
    }

    private placeRow(
        renderer: GpuGameBoxRenderer,
        shelf: ShelfPosition,
        surface: ShelfSurface,
        games: SteamGameData[],
        side: ShelfSide,
        boxDimensions: { width: number; height: number; depth: number }
    ): number {
        const positions = GameBoxUtils.calculateGamePositions(
            shelf.position, surface, games, side, boxDimensions, shelf.rotationY
        )
        for (let i = 0; i < games.length; i++) {
            const rotation = GameBoxUtils.calculateGameRotation(shelf.rotationY, side)
            renderer.placeGame(games[i], positions[i], side, rotation)
        }
        return games.length
    }

    // -------------------------------------------------------------------------
    // Helpers

    private getRenderer(): GpuGameBoxRenderer | null {
        if (!this.renderer) {
            GameBoxSpawner.logger.warn('Renderer not set — call setRenderer() before events arrive')
        }
        return this.renderer
    }
}
