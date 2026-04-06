import * as THREE from 'three'
import type { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { CategoryAssigner } from '../categorization/CategoryAssigner'
import { EventManager } from '../../core/EventManager'
import { 
    BatchProcessingStatus,
    StorePropsEventTypes, 
    type BatchReadyForPlacementEvent,
    type ShelfSpaceRequestedEvent,
    type ShelfCreatedEvent,
    type GamesPlacedEvent
} from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'

/**
 * GameBoxSpawner
 * 
 * Responsible for spawning game boxes on shelves using the instanced renderer.
 * Handles game distribution across shelf surfaces (front/back of each shelf board).
 * 
 * Extracted from GpuStorePropsRenderer to isolate game placement logic.
 * Event-driven flow:
 * - Observes BatchReadyForPlacement
 * - Emits ShelfSpaceRequested
 * - Observes ShelfCreated
 * - Emits GamesPlaced
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)
    private gameBoxRenderer?: GpuGameBoxRenderer
    
    // Track pending games waiting for shelf creation
    private pendingGames: Map<number, readonly SteamGameData[]> = new Map()
    private readonly categoryAssigner = new CategoryAssigner()
    
    constructor(gameBoxRenderer?: GpuGameBoxRenderer) {
        this.gameBoxRenderer = gameBoxRenderer

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfCreated,
            this.handleShelfCreated.bind(this)
        )
        
        GameBoxSpawner.logger.debug('Registered listeners for BatchReadyForPlacement and ShelfCreated events')
    }

    public setGameBoxRenderer(gameBoxRenderer: GpuGameBoxRenderer): void {
        this.gameBoxRenderer = gameBoxRenderer
    }
    
    /**
     * Handle BatchReadyForPlacement event
     * Stores games and requests shelf space via event
     */
    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches, shelfLabel: eventShelfLabel } = event.detail
        
        GameBoxSpawner.logger.debug(
            `[EVENT PATH] BatchReadyForPlacement received: ` +
            `batch ${batchIndex + 1}/${totalBatches}, ${games.length} games. ` +
            `Emitting ShelfSpaceRequested...`
        )
        
        // Store games pending shelf creation
        this.pendingGames.set(batchIndex, games)

        // Prefer upstream batch label (group-aware batching), fallback to local inference
        const shelfLabel = eventShelfLabel ?? this.determinePrimaryGenreLabel(games)

        // Emit ShelfSpaceRequested event
        EventManager.getInstance().emit<ShelfSpaceRequestedEvent>(
            StorePropsEventTypes.ShelfSpaceRequested,
            {
                gamesCount: games.length,
                batchIndex: batchIndex,
                shelfLabel,
                status: BatchProcessingStatus.ShelfRequested,
                lastModified: Date.now()
            }
        )
        GameBoxSpawner.logger.debug(`Emitted ShelfSpaceRequested for batch ${batchIndex + 1}`)
    }
    
    private determinePrimaryGenreLabel(games: ReadonlyArray<SteamGameData>): string {
        const groups = this.categoryAssigner.assign([...games])
        // Debug: log genre distribution for the first batch to trace 'Other' issue
        if (GameBoxSpawner.logger) {
            const genreSample = games.slice(0, 3).map(g => `${g.name}:${g.genres?.[0]?.description ?? 'none'}`)
            GameBoxSpawner.logger.debug(
                `[CAT-DEBUG] batch genres sample: ${genreSample.join(', ')} ` +
                `→ groups: ${groups.map(g => `${g.genre}(${g.games.length})`).join(', ')}`
            )
        }
        // Prefer first non-Other group; fall back to Other
        const firstNonOther = groups.find(g => g.genre !== 'Other')
        return firstNonOther?.label ?? 'Other'
    }

    /**
     * Handle ShelfCreated event
     * Retrieves pending games and places them on the shelf
     */
    private handleShelfCreated(event: CustomEvent<ShelfCreatedEvent>): void {
        const { position, batchIndex, rowIndex = 0, shelfIndex = 0, shelfRotationY = 0 } = event.detail
        
        GameBoxSpawner.logger.debug(
            `[EVENT PATH] ShelfCreated received for batch ${batchIndex + 1}. ` +
            `Spawning games at position (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )
        
        const games = this.pendingGames.get(batchIndex)
        if (!games) {
            GameBoxSpawner.logger.warn(`No pending games found for batch ${batchIndex}`);
            EventManager.getInstance().emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                {
                    batchIndex,
                    status: BatchProcessingStatus.Failed
                }
            )
            return
        }
        
        // Spawn games using event-driven path
        this.spawnGamesOnShelf(position, games, rowIndex, shelfIndex, shelfRotationY)
        
        // Clean up pending games
        this.pendingGames.delete(batchIndex)
        
        // Emit GamesPlaced event
        EventManager.getInstance().emit<GamesPlacedEvent>(
            StorePropsEventTypes.GamesPlaced,
            {
                batchIndex: batchIndex,
                status: BatchProcessingStatus.GamesPlaced
            }
        )
        GameBoxSpawner.logger.debug(
            `[EVENT PATH] Spawned ${games.length} games, emitted GamesPlaced for batch ${batchIndex + 1}`
        )
    }
    
    /**
     * Spawn games on a shelf at the given position
     * 
     * @param shelfPosition - World position of shelf origin
     * @param games - Games to place on this shelf
     * @param rowIndex - Row index (for debugging)
     * @param shelfIndex - Shelf index within row (for debugging)
     */
    spawnGamesOnShelf(
        shelfPosition: THREE.Vector3,
        games: readonly SteamGameData[],
        _rowIndex: number,
        _shelfIndex: number,
        shelfRotationY: number = 0
    ): void {
        // Get shelf surface configuration using shared utility (GPU path: hardcoded surfaces)
        const shelfSurfaces = ShelfSurfaceUtils.findShelfSurfaces(null, true)
        
        if (shelfSurfaces.length === 0) {
            return
        }
        
        let gameIndex = 0
        
        for (const surface of shelfSurfaces) {
            if (gameIndex >= games.length) break
            
            const frontGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
            if (frontGames.length > 0) {
                this.createGameBoxes(shelfPosition, surface, frontGames, ShelfSide.Front, shelfRotationY)
                gameIndex += frontGames.length
            }
            
            if (gameIndex < games.length) {
                // TD: wall-shelf-back-side — wall-mounted shelves should not fill the back side.
                // Currently all shelves fill both sides. When wall vs. floor-standing shelf types
                // are differentiated, gate this on shelf.isWallMounted or similar.
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    this.createGameBoxes(shelfPosition, surface, backGames, ShelfSide.Back, shelfRotationY)
                    gameIndex += backGames.length
                }
            }
        }
    }
    
    /**
     * Create game boxes for a set of games on a specific shelf surface
     */
    private createGameBoxes(
        shelfPosition: THREE.Vector3,
        surface: ShelfSurface,
        games: readonly SteamGameData[],
        side: ShelfSide,
        shelfRotationY: number
    ): void {
        if (!this.gameBoxRenderer) {
            GameBoxSpawner.logger.warn('GameBoxRenderer unavailable while creating game boxes')
            return
        }

        const boxDimensions = this.gameBoxRenderer.getDimensions()
        const gamePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition,
            surface,
            games as SteamGameData[], // Cast readonly to mutable for legacy utility
            side,
            boxDimensions,
            shelfRotationY
        )
        
        for (let i = 0; i < games.length; i++) {
            this.createSingleGameBox(games[i], gamePositions[i], side, i, shelfRotationY)
        }
    }
    
    /**
     * Create a single game box at the specified position
     */
    private createSingleGameBox(
        game: SteamGameData,
        worldPosition: THREE.Vector3,
        side: ShelfSide,
        _index: number,
        shelfRotationY: number
    ): void {
        if (!this.gameBoxRenderer) {
            GameBoxSpawner.logger.warn('GameBoxRenderer unavailable while creating a game box')
            return
        }
        const effectiveSide = shelfRotationY === Math.PI
            ? (side === ShelfSide.Front ? ShelfSide.Back : ShelfSide.Front)
            : side

        this.gameBoxRenderer.createGameBoxAuto(game, worldPosition, effectiveSide)
    }
}
