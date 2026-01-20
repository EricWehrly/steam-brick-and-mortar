import * as THREE from 'three'
import type { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'
import { EventManager } from '../../core/EventManager'
import { StorePropsEventTypes, type BatchReadyForPlacementEvent } from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'

/**
 * GameBoxSpawner
 * 
 * Responsible for spawning game boxes on shelves using the instanced renderer.
 * Handles game distribution across shelf surfaces (front/back of each shelf board).
 * 
 * Extracted from GpuStorePropsRenderer to isolate game placement logic.
 * 
 * Phase 3c: Now observes BatchReadyForPlacement events (read-only mode).
 * Currently logs events but continues using direct method calls (dual-path).
 */
export class GameBoxSpawner {
    private static logger = Logger.createLogFunctions(GameBoxSpawner.name)
    
    constructor(
        private readonly gameBoxRenderer: GpuGameBoxRenderer
    ) {
        // Phase 3c: Register listener for BatchReadyForPlacement events (read-only observation)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.handleBatchReadyForPlacement.bind(this)
        )
        GameBoxSpawner.logger.debug('Registered listener for BatchReadyForPlacement events (Phase 3c: observation mode)')
    }
    
    /**
     * Handle BatchReadyForPlacement event (Phase 3c: read-only observation)
     * Currently logs event data but does NOT act on it - old path still functional
     */
    private handleBatchReadyForPlacement(event: CustomEvent<BatchReadyForPlacementEvent>): void {
        const { games, batchIndex, totalBatches } = event.detail
        GameBoxSpawner.logger.debug(
            `[Phase 3c OBSERVATION] BatchReadyForPlacement received: ` +
            `batch ${batchIndex + 1}/${totalBatches}, ${games.length} games. ` +
            `NOT ACTING - still using direct method calls.`
        )
        // No action taken - this is observation-only to verify events arrive correctly
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
        games: SteamGameData[], 
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
        games: SteamGameData[], 
        side: ShelfSide
    ): void {
        const boxDimensions = this.gameBoxRenderer.getDimensions()
        const gamePositions = GameBoxUtils.calculateGamePositions(
            shelfPosition, 
            surface, 
            games, 
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
