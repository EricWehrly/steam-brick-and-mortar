import * as THREE from 'three'
import type { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { 
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
 * 
 * Phase 3c: Observes BatchReadyForPlacement events (read-only mode)
 * Phase 3e: Emits ShelfSpaceRequested and listens for ShelfCreated (dual-path active)
 * Currently uses BOTH event path and direct method calls for safety
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)
    
    // Phase 3e: Track pending games waiting for shelf creation
    private pendingGames: Map<number, readonly SteamGameData[]> = new Map()
    
    constructor(
        private readonly gameBoxRenderer: GpuGameBoxRenderer
    ) {
        // Phase 3c: Register listener for BatchReadyForPlacement events
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        
        // Phase 3e: Register listener for ShelfCreated events
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfCreated,
            this.handleShelfCreated.bind(this)
        )
        
        GameBoxSpawner.logger.debug('Registered listeners for BatchReadyForPlacement and ShelfCreated events (Phase 3e: dual-path)');
    }
    
    /**
     * Handle BatchReadyForPlacement event (Phase 3e: now emits ShelfSpaceRequested)
     * Stores games and requests shelf space via event
     */
    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail
        
        GameBoxSpawner.logger.debug(
            `[Phase 3e EVENT PATH] BatchReadyForPlacement received: ` +
            `batch ${batchIndex + 1}/${totalBatches}, ${games.length} games. ` +
            `Emitting ShelfSpaceRequested...`
        )
        
        // Store games pending shelf creation
        this.pendingGames.set(batchIndex, games)
        
        // Emit ShelfSpaceRequested event
        EventManager.getInstance().emit<ShelfSpaceRequestedEvent>(
            StorePropsEventTypes.ShelfSpaceRequested,
            {
                gamesCount: games.length,
                batchIndex: batchIndex
            }
        )
        GameBoxSpawner.logger.debug(`Emitted ShelfSpaceRequested for batch ${batchIndex + 1}`)
    }
    
    /**
     * Handle ShelfCreated event (Phase 3e: spawn games on created shelf)
     * Retrieves pending games and places them on the shelf
     */
    private handleShelfCreated(event: CustomEvent<ShelfCreatedEvent>): void {
        const { position, batchIndex } = event.detail
        
        GameBoxSpawner.logger.debug(
            `[Phase 3e EVENT PATH] ShelfCreated received for batch ${batchIndex + 1}. ` +
            `Spawning games at position (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)})`
        )
        
        const games = this.pendingGames.get(batchIndex)
        if (!games) {
            GameBoxSpawner.logger.warn(`No pending games found for batch ${batchIndex}`);
            return
        }
        
        // Spawn games using event-driven path
        this.spawnGamesOnShelf(position, games, 0, 0)
        
        // Clean up pending games
        this.pendingGames.delete(batchIndex)
        
        // Emit GamesPlaced event
        EventManager.getInstance().emit<GamesPlacedEvent>(
            StorePropsEventTypes.GamesPlaced,
            {
                gamesCount: games.length,
                batchIndex: batchIndex
            }
        )
        GameBoxSpawner.logger.debug(
            `[Phase 3e EVENT PATH] Spawned ${games.length} games, emitted GamesPlaced for batch ${batchIndex + 1}`
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
        _shelfIndex: number
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
                this.createGameBoxes(shelfPosition, surface, frontGames, ShelfSide.Front)
                gameIndex += frontGames.length
            }
            
            if (gameIndex < games.length) {
                const backGames = games.slice(gameIndex, gameIndex + GameLayoutConstants.GAMES_PER_SURFACE)
                if (backGames.length > 0) {
                    this.createGameBoxes(shelfPosition, surface, backGames, ShelfSide.Back)
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
        side: ShelfSide
    ): void {
        const boxDimensions = this.gameBoxRenderer.getDimensions()
        const gamePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition, 
            surface, 
            games as SteamGameData[], // Cast readonly to mutable for legacy utility
            side, 
            boxDimensions
        )
        
        for (let i = 0; i < games.length; i++) {
            this.createSingleGameBox(games[i], gamePositions[i], side, i)
        }
    }
    
    /**
     * Create a single game box at the specified position
     */
    private createSingleGameBox(
        game: SteamGameData, 
        worldPosition: THREE.Vector3, 
        side: ShelfSide,
        _index: number
    ): void {
        this.gameBoxRenderer.createGameBoxAuto(game, worldPosition, side)
    }
}
