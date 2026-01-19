import * as THREE from 'three'
import type { GpuGameBoxRenderer } from '../game-box/GpuGameBoxRenderer'
import type { SteamGameData } from '../game-box/types/GameData'
import { ShelfSurfaceUtils, type ShelfSurface, ShelfSide, GameBoxUtils, GameLayoutConstants } from '../props/SharedPropsUtils'

/**
 * GameBoxSpawner
 * 
 * Responsible for spawning game boxes on shelves using the instanced renderer.
 * Handles game distribution across shelf surfaces (front/back of each shelf board).
 * 
 * Extracted from GpuStorePropsRenderer to isolate game placement logic.
 */
export class GameBoxSpawner {
    constructor(
        private readonly gameBoxRenderer: GpuGameBoxRenderer
    ) {}
    
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
