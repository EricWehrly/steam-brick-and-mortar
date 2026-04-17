import * as THREE from 'three'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent,
    type GameBoxSpawnedEvent
} from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'

/**
 * GameBoxSpawner
 *
 * Responsible for spawning game boxes on shelves using the instanced renderer.
 * Event-driven flow:
 * - Observes BatchReadyForPlacement → stores games as pending
 * - Observes ShelfReady → places stored games on shelf, emits GamesPlaced
 *
 * Category assignment is NOT this class's responsibility. Signs are placed
 * by ShelfSectionPlanner after all batches complete.
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)
    private pendingGames: Map<number, readonly SteamGameData[]> = new Map()

    constructor() {
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.handleShelfReady.bind(this)
        )
        GameBoxSpawner.logger.debug('Registered listeners for BatchReadyForPlacement and ShelfReady events')
    }

    public reset(): void {
        this.pendingGames.clear()
        GameBoxSpawner.logger.debug('Reset pending games')
    }

    public setGameBoxRenderer(gameBoxRenderer: GpuGameBoxRenderer): void {
        this.gameBoxRenderer = gameBoxRenderer
    }
    
    /**
     * Handle BatchReadyForPlacement event
     * Stores games and requests shelf space via event
     */
    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        GameBoxSpawner.logger.debug(
            `[EVENT PATH] BatchReadyForPlacement received: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — stored as pending`
        )

        this.pendingGames.set(batchIndex, games)
    }

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { position, batchIndex, rotationY } = event.detail

        GameBoxSpawner.logger.debug(
            `[EVENT PATH] ShelfReady received for batch ${batchIndex + 1}. ` +
            `Spawning games at (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )

        const games = this.pendingGames.get(batchIndex)
        if (!games) {
            GameBoxSpawner.logger.warn(`No pending games found for batch ${batchIndex}`)
            EventManager.getInstance().emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                { batchIndex, status: BatchProcessingStatus.Failed }
            )
            return
        }

        this.spawnGamesOnShelf(position, games, rotationY)
        this.pendingGames.delete(batchIndex)

        EventManager.getInstance().emit<GamesPlacedEvent>(
            StorePropsEventTypes.GamesPlaced,
            { batchIndex, status: BatchProcessingStatus.GamesPlaced }
        )
        GameBoxSpawner.logger.debug(`[EVENT PATH] Spawned ${games.length} games, emitted GamesPlaced for batch ${batchIndex + 1}`)
    }

    spawnGamesOnShelf(
        shelfPosition: THREE.Vector3,
        games: readonly SteamGameData[],
        shelfRotationY: number = 0
    ): void {
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) return

        // ShelfSide.Front = far face (-localZ), ShelfSide.Back = near/player-facing face (+localZ).
        // Names are counterintuitive for arc shelves — rename deferred.
        let gameIndex = 0
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            const nearGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (nearGames.length > 0) {
                this.createGameBoxes(shelfPosition, surface, nearGames, ShelfSide.Back, shelfRotationY)
                gameIndex += nearGames.length
            }
            if (gameIndex < games.length) {
                const farGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (farGames.length > 0) {
                    this.createGameBoxes(shelfPosition, surface, farGames, ShelfSide.Front, shelfRotationY)
                    gameIndex += farGames.length
                }
            }
        }
    }

    private createGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface,
        games: readonly SteamGameData[],
        side: ShelfSide,
        shelfRotationY: number
    ): void {
        const boxDimensions = { width: 0.3, height: 0.4, depth: 0.08 }
        const gamePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition, surface, games as SteamGameData[], side, boxDimensions, shelfRotationY
        )
        for (let i = 0; i < games.length; i++) {
            this.createSingleGameBox(games[i], gamePositions[i], side, i, shelfRotationY)
        }
    }

    private createSingleGameBox(
        game: SteamGameData,
        worldPosition: THREE.Vector3,
        side: ShelfSide,
        _index: number,
        shelfRotationY: number
    ): void {
        const rotation = GameBoxUtils.calculateGameRotation(shelfRotationY, side)
        EventManager.getInstance().emit<GameBoxSpawnedEvent>(
            StorePropsEventTypes.GameBoxSpawned,
            {
                game,
                position: worldPosition.clone(),
                side,
                rotation,
            }
        )
    }
}
