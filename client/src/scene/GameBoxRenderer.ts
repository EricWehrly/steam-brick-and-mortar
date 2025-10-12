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
import { InstancedLabelRenderer } from './game-box/instancing/InstancedLabelRenderer'
import { InstancedArtworkRenderer } from './game-box/instancing/InstancedArtworkRenderer'
import { SharedMaterialManager } from '../utils/SharedMaterialManager'
import type { DataManager } from '../core/data/DataManager'

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

    // TODO: readonly?
    private static _instance: GameBoxRenderer;

    // We don't really use this, but need it for resolutions in SceneCoordinator
    // TODO: refactor SceneCoordinator to use DI properly
    static get Instance(): GameBoxRenderer {
        if(!this._instance) {
            console.error("it happened");
            this._instance = new GameBoxRenderer();
        }
        return this._instance;
    }

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
    private materialManagerInitialized = false
    
    // GPU Instanced rendering
    private instancedLabelRenderer?: InstancedLabelRenderer
    private instancedArtworkRenderer?: InstancedArtworkRenderer
    private labelInstanceIndex: number = 0 // Track next available label instance index
    private artworkInstanceIndex: number = 0 // Track next available artwork instance index
    
    // Dependencies for lazy initialization
    private dataManager?: DataManager

    constructor(
        // TODO: Allow dimensions as optional per created game box, with a geometry pool
        dimensions: Partial<GameBoxDimensions> = {},
        performanceConfig: Partial<TexturePerformanceConfig> = {},
        dataManager?: DataManager
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        
        // Create geometry instance (TODO: Replace with InstancedMesh for batching)
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Get shared material manager (defer initialization until needed)
        this.materialManager = SharedMaterialManager.getInstance()
        // Note: materialManager.initialize() is deferred until first render call
        
        if (Object.keys(performanceConfig).length > 0) {
            this.performanceManager = new GameBoxPerformanceManager(performanceConfig)
        }
        
        this.textureManager = new GameBoxTextureManager(this.performanceManager)
        
        this.dataManager = dataManager

        if(!GameBoxRenderer._instance) {
            GameBoxRenderer._instance = this;
        }
        
        console.debug(`📦 GameBoxRenderer initialized with dimensions: ${this.dimensions.width}x${this.dimensions.height}x${this.dimensions.depth}`)
    }

    /**
     * Ensure SharedMaterialManager is initialized (lazy initialization)
     * Only initializes when materials are actually needed for rendering
     */
    private ensureMaterialManagerInitialized(): void {
        if (!this.materialManagerInitialized) {
            this.materialManager.initialize()
            this.materialManagerInitialized = true
            console.log('🎨 SharedMaterialManager initialized on-demand')
        }
    }
    
    /**
     * Check if instanced label renderer is available and ready
     * Triggers lazy initialization if dependencies are available
     */
    // TODO: If instancedLabelRenderer can resolve the datamanager on its own, we can remove ALL OF THIS
    // (this method, and the methods it calls, and (I think) the methods that call it) and some of the internal tracking variables
    public hasInstancedLabelRenderer(): boolean {
        // Try lazy initialization if not yet initialized
        if (!this.instancedLabelRenderer && this.dataManager) {
            this.tryInitializeInstancedLabelRenderer()
        }
        
        return this.instancedLabelRenderer?.isReady() || false
    }

    public getInstancedLabelRenderer() {
        return this.instancedLabelRenderer;
    }

    public getInstancedArtworkRenderer() {
        return this.instancedArtworkRenderer;
    }
    
    /**
     * Lazy initialization of InstancedLabelRenderer
     * Bootstraps itself by pulling games from DataManager when available
     */
    private tryInitializeInstancedLabelRenderer(): void {
        if (this.instancedLabelRenderer || !this.dataManager) {
            return // Already initialized or missing dependencies
        }
        
        const games = this.dataManager.get<SteamGameData[]>('steam.games') || []
        if (games.length === 0) {
            console.warn('⏳ No games available yet for instanced label renderer initialization')
            return
        }
        
        this.instancedLabelRenderer = new InstancedLabelRenderer({
            maxInstances: games.length + 1
        })

        // Initialize artwork renderer for games with artwork
        this.instancedArtworkRenderer = new InstancedArtworkRenderer({
            maxInstances: games.length + 1 // Every 20th game + buffer
        })
        
        // Initialize label renderer asynchronously
        this.instancedLabelRenderer.initializeWithGames(games)
            .then(() => {
                this.labelInstanceIndex = 0 // Reset index counter
            })
            .catch((error) => {
                console.error('❌ Failed to initialize instanced label renderer:', error)
                this.instancedLabelRenderer = undefined
            })

        // Initialize artwork renderer
        this.instancedArtworkRenderer.initialize()
        this.artworkInstanceIndex = 0
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
        // Determine if this game has artwork
        const hasArtwork = textureOptions && textureOptions.artworkBlobs && Object.keys(textureOptions.artworkBlobs).length > 0
        
        if (hasArtwork && this.instancedArtworkRenderer?.isReady()) {
            // Use instanced artwork renderer for games with artwork
            return this.createInstancedArtworkBox(game, position, textureOptions!, name)
        } else if (this.hasInstancedLabelRenderer()) {
            // Use instanced label renderer for text-only games
            return this.createInstancedLabelBox(game, position, name)
        }
        
        // Fallback to individual game box creation
        const gameBox = this.createGameBoxCore(game, position, name)
        
        // Apply texture if available
        if (textureOptions) {
            this.textureManager.applyTexture(gameBox, textureOptions)
        }
        
        console.debug(`📦 Created individual game box: ${gameBox.name} at position (${gameBox.position.x.toFixed(2)}, ${gameBox.position.y.toFixed(2)}, ${gameBox.position.z.toFixed(2)})`)
        return gameBox
    }

    /**
     * Create a game box using GPU instanced artwork rendering
     * This method adds the game box to the InstancedArtworkRenderer for games with Steam artwork
     * Always returns null since instanced rendering doesn't create individual meshes
     */
    private createInstancedArtworkBox(
        game: SteamGameData,
        position: THREE.Vector3,
        textureOptions: GameBoxTextureOptions,
        name?: string
    ): THREE.Mesh | null {
        if (!this.instancedArtworkRenderer) {
            console.warn('Instanced artwork renderer not available, falling back to individual mesh')
            return this.createGameBoxCore(game, position, name)
        }

        // Reserve instance index immediately to prevent race conditions
        const reservedInstanceIndex = this.artworkInstanceIndex++

        // Use async method but don't await here to avoid blocking
        this.instancedArtworkRenderer.setArtworkInstance(
            reservedInstanceIndex,
            position,
            game.name,
            textureOptions
        ).then((success) => {
            if (!success) {
                console.warn(`Failed to add instanced artwork box for "${game.name}" at index ${reservedInstanceIndex}`)
            }
        }).catch((error) => {
            console.error(`Error adding instanced artwork for "${game.name}":`, error)
        })
        
        return null
    }

    /**
     * Create a game box using GPU instanced label rendering (text-only)
     * This method adds the game box to the InstancedLabelRenderer for text labels
     * Always returns null since instanced rendering doesn't create individual meshes
     */
    private createInstancedLabelBox(
        game: SteamGameData,
        position: THREE.Vector3,
        name?: string
    ): THREE.Mesh | null {
        if (!this.instancedLabelRenderer) {
            console.warn('Instanced label renderer not available, falling back to individual mesh')
            return this.createGameBoxCore(game, position, name)
        }

        // Reserve instance index immediately to prevent race conditions
        const reservedInstanceIndex = this.labelInstanceIndex++

        const success = this.instancedLabelRenderer.setLabelInstance(
            reservedInstanceIndex,
            position,
            game.name
        )
        
        if (!success) {
            console.warn(`Failed to add instanced label box for "${game.name}", falling back to individual mesh`)
            return this.createGameBoxCore(game, position, name)
        }
        
        return null
    }

    // Core creation logic used by public factory methods
    private createGameBoxCore(
        game: SteamGameData,
        position: THREE.Vector3,
        name?: string
    ): THREE.Mesh {
        this.ensureMaterialManagerInitialized()
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
        // Only use GPU instanced labels if renderer is initialized, otherwise skip labels
        if (this.instancedLabelRenderer?.isReady()) {
            this.addInstancedGameNameLabel(gameBox, game.name)
        } else {
            // Skip individual labels entirely - GPU instanced renderer will handle all labels
            console.debug(`⏳ Skipping label for "${game.name}" - GPU instanced renderer not ready`)
        }
        
        return gameBox
    }

    /**
     * Create a text label with the game name and add it to the game box
     * DEPRECATED: This method is only called as fallback when GPU instanced renderer isn't ready
     */
    private addGameNameLabel(gameBox: THREE.Mesh, gameName: string): void {
        console.warn(`📋 Creating individual label for "${gameName}" - GPU instanced renderer not available`)
        
        // Legacy individual label creation (should rarely be used)
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
    
    /**
     * Add game name label using GPU instanced rendering (high performance)
     * This method uses the InstancedLabelRenderer for massive performance gains
     */
    private addInstancedGameNameLabel(gameBox: THREE.Mesh, gameName: string): void {
        if (!this.instancedLabelRenderer) {
            console.warn('Instanced label renderer not available')
            return
        }
        
        // Calculate label position in world space (front face of game box)
        const labelPosition = new THREE.Vector3()
        gameBox.getWorldPosition(labelPosition)
        
        // Offset to front face of game box
        labelPosition.z += (this.dimensions.depth / 2) + 0.001
        
        // Reserve instance index immediately to prevent race conditions
        const reservedInstanceIndex = this.labelInstanceIndex++
        
        const success = this.instancedLabelRenderer.setLabelInstance(
            reservedInstanceIndex,
            labelPosition,
            gameName
        )
        
        if (success) {
            // Store instance info for cleanup/updates
            gameBox.userData.labelInstanceIndex = reservedInstanceIndex
            gameBox.userData.hasInstancedLabel = true
        } else {
            console.warn(`Failed to add instanced label for "${gameName}"`)
        }
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
        // Dispose custom materials and textures
        if (gameBox.material instanceof THREE.Material) {
            gameBox.material.dispose()
        } else if (Array.isArray(gameBox.material)) {
            gameBox.material.forEach(mat => mat.dispose())
        }
        
        // Dispose geometry (shared geometry should not be disposed here)
        // gameBox.geometry?.dispose() // Commented out to avoid disposing shared geometry
        
        // Handle instanced labels (no individual cleanup needed - managed by InstancedLabelRenderer)
        if (gameBox.userData.hasInstancedLabel) {
            console.debug(`🏷️ Game box had instanced label at index ${gameBox.userData.labelInstanceIndex}`)
            // Note: Individual instances don't need cleanup - InstancedLabelRenderer manages the pool
        } else {
            // Dispose individual label resources if present (legacy method)
            if (gameBox.userData.labelTexture) {
                gameBox.userData.labelTexture.dispose()
            }
            if (gameBox.userData.labelMesh) {
                gameBox.userData.labelMesh.geometry?.dispose()
                if (gameBox.userData.labelMesh.material instanceof THREE.Material) {
                    gameBox.userData.labelMesh.material.dispose()
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
        console.debug('🧹 Disposing GameBoxRenderer resources')
        
        // Dispose instanced renderers
        this.instancedLabelRenderer?.dispose()
        this.instancedLabelRenderer = undefined
        
        this.instancedArtworkRenderer?.dispose()
        this.instancedArtworkRenderer = undefined
        
        // Dispose geometry
        this.gameBoxGeometry.dispose()
        
        // Dispose of managers
        this.textureManager.dispose()
        this.performanceManager?.dispose()
        
        // Reset instance tracking
        this.labelInstanceIndex = 0
        this.artworkInstanceIndex = 0
        
        console.log('✅ GameBoxRenderer disposed including instanced renderers')
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
