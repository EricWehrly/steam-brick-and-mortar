/**
 * Game Box Renderer - Game Box 3D Object Management
 * 
 * Handles:
 * - Create and position game boxes
 * - Handle game box animations
 * - Manage placeholder vs real game boxes
 * - Apply textures from Steam artwork
 */

import * as THREE from 'three'
import { ValidationUtils } from '../utils'
import { MaterialUtils } from '../utils/MaterialUtils'

// Import types from modular structure
import type { GameData, SteamGameData } from './game-box/types/GameData'
import type {
    GameBoxDimensions,
    GameBoxPosition,
    ShelfConfiguration,
    GameBoxTextureOptions,
    GameBoxCreationRequest,
    GameBoxBatchCreationRequest
} from './game-box/types/GameBoxOptions'
import type { TexturePerformanceConfig, GameBoxPerformanceData } from './game-box/types/PerformanceTypes'
import { GameBoxPerformanceManager } from './game-box/GameBoxPerformanceManager'
import { GameBoxTextureManager } from './game-box/GameBoxTextureManager'
import { GameBoxLayoutUtils } from './game-box/GameBoxLayoutUtils'

// Export types for backward compatibility
export type {
    GameData,
    SteamGameData,
    GameBoxDimensions,
    GameBoxPosition,
    ShelfConfiguration,
    GameBoxTextureOptions,
    GameBoxCreationRequest,
    GameBoxBatchCreationRequest,
    TexturePerformanceConfig
}



export class GameBoxRenderer {
    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.15,
        height: 0.2,
        depth: 0.02
    }

    private dimensions: GameBoxDimensions
    private gameBoxGeometry: THREE.BoxGeometry
    
    // Composition: Specialized managers for different concerns
    private performanceManager?: GameBoxPerformanceManager
    private textureManager: GameBoxTextureManager

    constructor(
        dimensions: Partial<GameBoxDimensions> = {},
        shelfConfig: Partial<ShelfConfiguration> = {},
        performanceConfig: Partial<TexturePerformanceConfig> = {},
        private sceneManager?: any // Optional SceneManager for consistent scene interaction
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Initialize managers with composition
        if (Object.keys(performanceConfig).length > 0) {
            this.performanceManager = new GameBoxPerformanceManager(performanceConfig)
        }
        
        this.textureManager = new GameBoxTextureManager(this.performanceManager)
    }

    /**
     * Create placeholder game boxes
     */
    public createPlaceholderBoxes(count: number = 6, shelfConfig?: ShelfConfiguration): THREE.Mesh[] {
        
        const materials = this.createPlaceholderMaterials()
        const boxes: THREE.Mesh[] = []
        
        const config = shelfConfig ?? GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG
        const startX = GameBoxLayoutUtils.calculateStartX(count, config)
        
        for (let i = 0; i < count; i++) {
            const gameBox = new THREE.Mesh(
                this.gameBoxGeometry, 
                materials[i % materials.length]
            )
            
            // Mark as placeholder game box
            gameBox.userData = { 
                isGameBox: true, 
                isPlaceholder: true 
            }
            
            // Position the box
            const position = GameBoxLayoutUtils.calculateBoxPosition(i, startX, config)
            gameBox.position.set(position.x, position.y, position.z)
            
            // Enable shadows
            gameBox.castShadow = true
            gameBox.receiveShadow = true
            
            // Add subtle random rotation for natural look
            gameBox.rotation.y = (Math.random() - 0.5) * 0.1
            
            boxes.push(gameBox)
        }
        
        return boxes
    }

    /**
     * Create a game box from generic game data
     */
    public createGameBox(
        scene: THREE.Scene, 
        game: GameData | SteamGameData, 
        index: number
    ): THREE.Mesh | null {
        return this.createGameBoxWithTexture(scene, game, index)
    }

    /**
     * Create a game box from game data with optional texture support
     */
    public createGameBoxWithTexture(
        scene: THREE.Scene, 
        game: GameData | SteamGameData, 
        index: number,
        textureOptions?: GameBoxTextureOptions
    ): THREE.Mesh | null {
        // Check if we're within display limits

        // Create material - start with fallback color for immediate display
        const colorHue = ValidationUtils.stringToHue(game.name)
        const material = MaterialUtils.createGameBoxMaterialFromName(colorHue)
        
        const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
        
        // Mark as game box with game data
        const gameId = this.getGameId(game)
        const playtime = this.getGamePlaytime(game)
        
        gameBox.userData = { 
            isGameBox: true, 
            gameData: game,
            gameId: gameId,
            name: game.name,
            playtime: playtime
        }
        
        // Position the box - individual boxes use simple index-based positioning
        // Total layout centering will be handled by higher-level methods
        const config = GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG
        const position = this.calculateBoxPosition(index, 0, config)
        gameBox.position.set(position.x, position.y, position.z)
        
        // Enable shadows
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        // Apply texture if provided (async operation)
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, game, textureOptions).then((success) => {
                if (success) {
                    console.log(`🖼️ Applied texture to game box: ${game.name}`)
                }
            }).catch((error) => {
                console.warn(`⚠️ Failed to apply texture to ${game.name}:`, error)
            })
        }
        
        // Add to scene using SceneManager if available, otherwise direct add
        if (this.sceneManager) {
            // Use SceneManager for consistent scene interaction
            scene.add(gameBox)
        } else {
            scene.add(gameBox)
        }
        
        console.log(`📦 Added game box ${index}: ${game.name}`)
        return gameBox
    }

    /**
     * Helper methods to handle different game data formats
     */
    private getGameId(game: GameData | SteamGameData): string | number {
        return GameBoxLayoutUtils.getGameId(game)
    }
    
    private getGamePlaytime(game: GameData | SteamGameData): number {
        return GameBoxLayoutUtils.getGamePlaytime(game)
    }
    
    /**
     * Create game boxes from batch request (clean interface)
     */
    public createGameBoxesFromBatch(
        scene: THREE.Scene,
        request: GameBoxBatchCreationRequest
    ): THREE.Mesh[] {
        const { games, enablePerformanceFeatures = false } = request
        
        console.log(`🎮 Creating game boxes from ${games.length} games...`)
        
        if (!games || games.length === 0) {
            console.warn('⚠️ No games provided for game box creation')
            return []
        }

        // Sort games (no artificial limits - render all loaded games)
        const sortedGames = GameBoxLayoutUtils.sortAndLimitGames(games)
        const boxes: THREE.Mesh[] = []
        
        // Calculate centering for the entire set of boxes
        const config = GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG
        const startX = GameBoxLayoutUtils.calculateStartX(sortedGames.length, config)
        
        // Create game boxes with proper centering
        sortedGames.forEach((game, index) => {
            const creationRequest: GameBoxCreationRequest = {
                gameData: game,
                index,
                textureOptions: enablePerformanceFeatures ? {
                    enableLazyLoading: true
                } : undefined
            }
            
            const box = this.createGameBoxFromRequest(scene, creationRequest)
            if (box) {
                // Adjust position to center the entire set
                const currentPos = box.position
                box.position.set(currentPos.x + startX, currentPos.y, currentPos.z)
                boxes.push(box)
            }
        })
        
        console.log(`✅ Created ${boxes.length} game boxes from game library`)
        return boxes
    }
    
    /**
     * Create single game box from request (clean interface)
     */
    public createGameBoxFromRequest(
        scene: THREE.Scene,
        request: GameBoxCreationRequest
    ): THREE.Mesh | null {
        const { gameData, index, textureOptions } = request
        return this.createGameBoxWithTexture(scene, gameData, index, textureOptions)
    }
    
    /**
     * Create game boxes from game library data
     */
    public createGameBoxesFromGameData(
        scene: THREE.Scene, 
        games: (GameData | SteamGameData)[]
    ): THREE.Mesh[] {
        return this.createGameBoxesFromBatch(scene, { games })
    }
    
    /**
     * Create game boxes from Steam library data (legacy method)
     * TODO: Remove once SteamGameManager is refactored
     */
    public createGameBoxesFromSteamData(
        scene: THREE.Scene, 
        games: SteamGameData[]
    ): THREE.Mesh[] {
        return this.createGameBoxesFromGameData(scene, games)
    }

    /**
     * Clear all game boxes from the scene
     */
    public clearGameBoxes(scene: THREE.Scene): number {
        const existingBoxes = scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => scene.remove(box))
        console.log(`🗑️ Cleared ${existingBoxes.length} existing game boxes`)
        return existingBoxes.length
    }


    /**
     * Update box dimensions (requires recreating geometry)
     */
    public updateDimensions(newDimensions: Partial<GameBoxDimensions>) {
        this.dimensions = { ...this.dimensions, ...newDimensions }
        this.gameBoxGeometry.dispose()
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
    }

    private createPlaceholderMaterials(): THREE.MeshStandardMaterial[] {
        return MaterialUtils.createGameBoxMaterials()
    }

    private calculateStartX(numBoxes: number, config: ShelfConfiguration): number {
        return -(numBoxes - 1) * config.spacing / 2
    }

    private calculateBoxPosition(index: number, startX: number, config: ShelfConfiguration): GameBoxPosition {
        return {
            x: config.centerX + startX + (index * config.spacing),
            y: config.surfaceY, // Use exact Y position calculated by StoreLayout
            z: config.centerZ    // Use exact Z position calculated by StoreLayout
        }
    }

    private sortAndLimitGames(games: (GameData | SteamGameData)[]): (GameData | SteamGameData)[] {
        // Get games with recent playtime first, then alphabetical
        const playedGames = games
            .filter(game => this.getGamePlaytime(game) > 0)
            .sort((a, b) => this.getGamePlaytime(b) - this.getGamePlaytime(a))
        
        // Add unplayed games alphabetically
        const unplayedGames = games
            .filter(game => this.getGamePlaytime(game) === 0)
            .sort((a, b) => a.name.localeCompare(b.name))
        
        playedGames.push(...unplayedGames)
        
        return playedGames
    }

    /**
     * Dispose of all resources
     * (Important - call this when cleaning up the renderer)
     */
    public dispose(): void {
        // Dispose geometry
        this.gameBoxGeometry.dispose()
        
        // Dispose of managers
        this.textureManager.dispose()
        this.performanceManager?.dispose()
        
        console.log('🧹 Disposed GameBoxRenderer and all managers')
    }

    // Texture and fallback creation now handled by GameBoxTextureManager

    // Texture creation and fallback methods now handled by GameBoxTextureManager

    // ====================================================================
    // Performance features delegated to GameBoxPerformanceManager
    public updatePerformanceData(camera: THREE.Camera, scene: THREE.Scene): void {
        this.performanceManager?.updatePerformanceData(camera, scene)
    }

    public cleanupOffScreenTextures(): void {
        this.performanceManager?.cleanupOffScreenTextures()
    }

    public getPerformanceStats() {
        return this.performanceManager?.getPerformanceStats() ?? {
            totalGameBoxes: 0,
            visibleGameBoxes: 0,
            loadedTextures: 0,
            activeTextures: 0,
            averageDistance: 0
        }
    }

    // Access to specialized managers for specific use cases
    public getTextureManager(): GameBoxTextureManager {
        return this.textureManager
    }

    public getPerformanceManager(): GameBoxPerformanceManager | undefined {
        return this.performanceManager
    }

}
