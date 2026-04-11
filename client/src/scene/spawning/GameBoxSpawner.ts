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

    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail

        GameBoxSpawner.logger.debug(
            `[EVENT PATH] BatchReadyForPlacement received: batch ${batchIndex + 1}/${totalBatches}, ${games.length} games — stored as pending`
        )

        this.pendingGames.set(batchIndex, games)
    }

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { position, batchIndex, rowIndex, rotationY } = event.detail

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

        this.spawnGamesOnShelf(position, games, rowIndex, rotationY)
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
        rowIndex: number,
        shelfRotationY: number = 0
    ): void {
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        if (shelfSurfaces.length === 0) return

        // ShelfSide naming note: 'Front' = local -Z face (away from player after arc rotation).
        // 'Back' = local +Z face (toward origin = toward player spawn).
        // We always populate the player-facing side (Back) first.
        // The far side (Front) is suppressed on the back wall ring to avoid clipping.
        // Note: ShelfSide.Front = far face (-localZ), ShelfSide.Back = near/player-facing face (+localZ).
        // Names are counterintuitive for arc shelves. A comment clarifies intent; rename deferred.
        let gameIndex = 0
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            // Near side = ShelfSide.Back (+localZ, faces origin/player)
            const nearGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (nearGames.length > 0) {
                this.createGameBoxes(shelfPosition, surface, nearGames, ShelfSide.Back, shelfRotationY)
                gameIndex += nearGames.length
            }
            if (gameIndex < games.length) {
                // Far side = ShelfSide.Front (-localZ, faces away from player)
                // Suppress on back wall ring (row 4) to avoid clipping and overdensity.
                // TD: formalize as layout policy from planner (not hardcoded row index).
                const allowFarSide = rowIndex < 4
                if (!allowFarSide) {
                    continue
                }

                // TD: wall-shelf-back-side - wall-mounted shelves should not fill the far side.
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
