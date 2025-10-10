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
import { MaterialUtils } from '../utils/MaterialUtils'

// Import types from modular structure
import type { SteamGameData } from './game-box/types/GameData'
import type {
    GameBoxDimensions,
    GameBoxPosition,
    ShelfConfiguration,
    GameBoxTextureOptions,
    GameBoxCreationRequest,
    GameBoxBatchCreationRequest
} from './game-box/types/GameBoxOptions'
import type { TexturePerformanceConfig } from './game-box/types/PerformanceTypes'
import { GameBoxPerformanceManager } from './game-box/GameBoxPerformanceManager'
import { GameBoxTextureManager } from './game-box/GameBoxTextureManager'
import { GameBoxLayoutUtils } from './game-box/GameBoxLayoutUtils'
import { SharedMaterialManager } from '../utils/SharedMaterialManager'

// Export types for backward compatibility
export type {
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
        width: 0.3,   // 30cm width
        height: 0.4,  // 40cm height 
        depth: 0.1    // 10cm depth
    }

    private dimensions: GameBoxDimensions
    private gameBoxGeometry: THREE.BoxGeometry
    
    // Composition: Specialized managers for different concerns
    private performanceManager?: GameBoxPerformanceManager
    private textureManager: GameBoxTextureManager
    private materialManager: SharedMaterialManager

    constructor(
        dimensions: Partial<GameBoxDimensions> = {},
        performanceConfig: Partial<TexturePerformanceConfig> = {}
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        
        // Create geometry instance (TODO: Replace with InstancedMesh for batching)
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Initialize shared material manager
        this.materialManager = SharedMaterialManager.getInstance()
        this.materialManager.initialize()
        
        if (Object.keys(performanceConfig).length > 0) {
            this.performanceManager = new GameBoxPerformanceManager(performanceConfig)
        }
        
        this.textureManager = new GameBoxTextureManager(this.performanceManager)
    }

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

    public createGameBoxAtPosition(
        scene: THREE.Scene,
        game: SteamGameData,
        position: THREE.Vector3,
        textureOptions?: GameBoxTextureOptions,
        name?: string
    ): THREE.Mesh | null {
        // Create core game box
        const gameBox = this.createGameBoxCore(game, position, name)
        
        // Apply texture if provided (async operation)
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, game, textureOptions).then((success) => {
                if (success) {
                    console.debug(`✅ Applied texture to game box: ${game.name}`)
                }
            }).catch(error => {
                console.debug(`⚠️ Failed to apply texture to game box ${game.name}:`, error)
            })
        }
        
        // Add to scene
        scene.add(gameBox)
        console.debug(`📦 Created positioned game box for "${game.name}" at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
        
        return gameBox
    }

    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        textureOptions?: GameBoxTextureOptions,
        name?: string
    ): THREE.Mesh | null {
        // Create core game box
        const gameBox = this.createGameBoxCore(game, position, name)
        
        // Apply texture if available
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, game, textureOptions)
        }
        
        console.debug(`📦 Created game box: ${gameBox.name} at position (${gameBox.position.x.toFixed(2)}, ${gameBox.position.y.toFixed(2)}, ${gameBox.position.z.toFixed(2)})`)
        return gameBox
    }

    public createGameBoxWithTexture(
        scene: THREE.Scene, 
        game: SteamGameData, 
        index: number,
        textureOptions?: GameBoxTextureOptions
    ): THREE.Mesh | null {
        // Calculate position using GameBoxLayoutUtils
        const config = GameBoxLayoutUtils.DEFAULT_SHELF_CONFIG
        const position = GameBoxLayoutUtils.calculateBoxPosition(index, 0, config)
        
        // Create core game box
        const gameBox = this.createGameBoxCore(game, new THREE.Vector3(position.x, position.y, position.z))
        
        // Apply texture if provided (async operation)
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, textureOptions).then((success) => {
                if (success) {
                    console.log(`🖼️ Applied texture to game box: ${game.name}`)
                }
            }).catch((error) => {
                console.warn(`⚠️ Failed to apply texture to ${game.name}:`, error)
            })
        }
        
        scene.add(gameBox)
        
        console.log(`📦 Added game box ${index}: ${game.name}`)
        return gameBox
    }

    // Core creation logic used by public factory methods
    private createGameBoxCore(
        game: SteamGameData,
        position: THREE.Vector3,
        name?: string
    ): THREE.Mesh {
        const material = this.materialManager.getGameBoxMaterialFromName(game.name)
        
        const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
        gameBox.position.copy(position)
        gameBox.name = name || `game-${game.name?.replace(/[^a-zA-Z0-9]/g, '-') || 'unknown'}`
        
        gameBox.userData = {
            isGameBox: true,
            gameData: game,
            gameId: GameBoxLayoutUtils.getGameId(game),
            name: game.name,
            playtime: GameBoxLayoutUtils.getGamePlaytime(game)
        }
        
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        return gameBox
    }
    
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
    
    public createGameBoxFromRequest(
        scene: THREE.Scene,
        request: GameBoxCreationRequest
    ): THREE.Mesh | null {
        const { gameData, index, textureOptions } = request
        return this.createGameBoxWithTexture(scene, gameData, index, textureOptions)
    }
    
    public createGameBoxesFromGameData(
        scene: THREE.Scene, 
        games: SteamGameData[]
    ): THREE.Mesh[] {
        return this.createGameBoxesFromBatch(scene, { games })
    }

    public clearGameBoxes(scene: THREE.Scene): number {
        const existingBoxes = scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => scene.remove(box))
        console.log(`🗑️ Cleared ${existingBoxes.length} existing game boxes`)
        return existingBoxes.length
    }

    public updateDimensions(newDimensions: Partial<GameBoxDimensions>) {
        this.dimensions = { ...this.dimensions, ...newDimensions }
        // Recreate geometry with new dimensions
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

    public dispose(): void {
        // Dispose geometry
        this.gameBoxGeometry.dispose()
        
        // Dispose of managers
        this.textureManager.dispose()
        this.performanceManager?.dispose()
        
        // Note: Shared materials are managed by SharedMaterialManager
        
        console.log('🧹 Disposed GameBoxRenderer and all managers')
    }

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
}
