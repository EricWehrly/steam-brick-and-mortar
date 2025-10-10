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
            this.textureManager.applyTexture(gameBox, textureOptions)
        }
        
        console.debug(`📦 Created game box: ${gameBox.name} at position (${gameBox.position.x.toFixed(2)}, ${gameBox.position.y.toFixed(2)}, ${gameBox.position.z.toFixed(2)})`)
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
        
        // Add game name text label to the front face
        this.addGameNameLabel(gameBox, game.name)
        
        return gameBox
    }

    /**
     * Create a text label with the game name and add it to the game box
     * The label appears on the front face of the box
     */
    private addGameNameLabel(gameBox: THREE.Mesh, gameName: string): void {
        // Create canvas for text rendering
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) {
            console.warn('Could not create canvas context for game name label')
            return
        }

        // Set canvas size (higher resolution for better quality)
        canvas.width = 512
        canvas.height = 512

        // Configure text rendering
        context.fillStyle = '#000000' // Black background
        context.fillRect(0, 0, canvas.width, canvas.height)
        
        context.fillStyle = '#ffffff' // White text
        context.font = 'bold 48px Arial, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        
        // Word wrap the game name if it's too long
        const maxWidth = canvas.width - 40 // 20px padding on each side
        const words = gameName.split(' ')
        const lines: string[] = []
        let currentLine = words[0]
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i]
            const metrics = context.measureText(testLine)
            if (metrics.width > maxWidth) {
                lines.push(currentLine)
                currentLine = words[i]
            } else {
                currentLine = testLine
            }
        }
        lines.push(currentLine)
        
        // Draw each line of text
        const lineHeight = 60
        const startY = (canvas.height - (lines.length * lineHeight)) / 2 + lineHeight / 2
        lines.forEach((line, index) => {
            context.fillText(line, canvas.width / 2, startY + (index * lineHeight))
        })

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true

        // Create a plane for the label (slightly in front of the box)
        const labelGeometry = new THREE.PlaneGeometry(this.dimensions.width * 0.95, this.dimensions.height * 0.95)
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        })
        
        const label = new THREE.Mesh(labelGeometry, labelMaterial)
        
        // Position label slightly in front of the box (on the front face)
        label.position.z = (this.dimensions.depth / 2) + 0.001
        label.name = `${gameBox.name}-label`
        
        // Add label as child of game box so it moves with the box
        gameBox.add(label)
        
        // Store texture reference for cleanup
        gameBox.userData.labelTexture = texture
        gameBox.userData.labelMesh = label
    }

    public clearGameBoxes(scene: THREE.Scene): number {
        const existingBoxes = scene.children.filter(child => 
            child.userData?.isGameBox
        )
        existingBoxes.forEach(box => {
            this.disposeGameBox(box as THREE.Mesh)
            scene.remove(box)
        })
        console.log(`🗑️ Cleared ${existingBoxes.length} existing game boxes`)
        return existingBoxes.length
    }

    /**
     * Dispose of a single game box and its resources
     */
    private disposeGameBox(gameBox: THREE.Mesh): void {
        // Dispose label texture if it exists
        if (gameBox.userData.labelTexture) {
            gameBox.userData.labelTexture.dispose()
        }
        
        // Dispose label mesh if it exists
        if (gameBox.userData.labelMesh) {
            const labelMesh = gameBox.userData.labelMesh as THREE.Mesh
            if (labelMesh.geometry) labelMesh.geometry.dispose()
            if (labelMesh.material) {
                if (Array.isArray(labelMesh.material)) {
                    labelMesh.material.forEach(mat => mat.dispose())
                } else {
                    labelMesh.material.dispose()
                }
            }
        }
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
