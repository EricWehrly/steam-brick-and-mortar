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
import { ShelfSide } from './props/SharedPropsUtils'
import { SharedMaterialManager, MaterialType } from '../utils/SharedMaterialManager'
import { DataManager } from '../core/data/DataManager'

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
        depth: 0.08    // 8cm depth
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

    constructor() {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS }
        
        // Create geometry instance (TODO: Replace with InstancedMesh for batching)
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        // Get shared material manager (defer initialization until needed)
        this.materialManager = SharedMaterialManager.getInstance()
        // Note: materialManager.initialize() is deferred until first render call
        
        this.textureManager = new GameBoxTextureManager(this.performanceManager)
        
        // DataManager will be resolved lazily when needed
        
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
        if (!this.instancedLabelRenderer && this.getDataManager()) {
            this.tryInitializeInstancedLabelRenderer()
        }
        
        return this.instancedLabelRenderer?.isReady() || false
    }

    /**
     * Lazy resolver for DataManager instance
     */
    private getDataManager(): DataManager | undefined {
        if (!this.dataManager) {
            try {
                this.dataManager = DataManager.getInstance()
            } catch {
                console.warn('⏳ DataManager not available yet for GameBoxRenderer')
                return undefined
            }
        }
        return this.dataManager
    }
    
    /**
     * Lazy initialization of InstancedLabelRenderer
     * Bootstraps itself by pulling games from DataManager when available
     */
    private tryInitializeInstancedLabelRenderer(): void {
        const dataManager = this.getDataManager()
        if (this.instancedLabelRenderer || !dataManager) {
            return // Already initialized or missing dependencies
        }
        
        // TODO: Use a key / enum for "steam.games"
        const games = dataManager.get<SteamGameData[]>('steam.games') || []
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


    public createGameBox(
        game: SteamGameData,
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        textureOptions?: GameBoxTextureOptions,
        name?: string,
        side: ShelfSide = ShelfSide.Front
    ): THREE.Mesh | null {
        // Determine if this game has artwork
        const hasArtwork = textureOptions && textureOptions.artworkBlobs && Object.keys(textureOptions.artworkBlobs).length > 0
        
        if (hasArtwork && this.instancedArtworkRenderer?.isReady()) {
            return this.createInstancedArtworkBox(game, position, textureOptions!, name)
        } else if (this.hasInstancedLabelRenderer()) {
            return this.createInstancedLabelBox(game, position, name, side)
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
        name?: string,
        side: ShelfSide = ShelfSide.Front
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
            game.name,
            side
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
        const material = this.materialManager.getMaterial(MaterialType.FallbackGameBox)
        
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
        // Use GPU instanced labels if available, otherwise create individual canvas-based labels
        if (this.instancedLabelRenderer?.isReady()) {
            this.addInstancedGameNameLabel(gameBox, game.name)
        } else {
            this.addIndividualTextLabel(gameBox, game.name)
        }
        
        return gameBox
    }
    
    private addIndividualTextLabel(gameBox: THREE.Mesh, gameName: string): void {
        // Create canvas for text rendering
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            console.warn('Could not get 2D canvas context for text label')
            return
        }
        
        // Set canvas size
        const textureSize = 512
        canvas.width = textureSize
        canvas.height = textureSize
        
        // Set up text style
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 48px Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        // Fill background (optional, for visibility)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Draw text
        ctx.fillStyle = '#ffffff'
        ctx.fillText(gameName, canvas.width / 2, canvas.height / 2)
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas)
        texture.needsUpdate = true
        
        // Create text plane geometry and material
        const textGeometry = new THREE.PlaneGeometry(0.25, 0.25)
        const textMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        })
        
        // Create text mesh
        const textMesh = new THREE.Mesh(textGeometry, textMaterial)
        
        // Position text on front face of game box
        textMesh.position.set(0, 0, 0.051) // Slightly in front of the game box
        textMesh.name = `${gameBox.name}-label`
        
        // Add text to game box
        gameBox.add(textMesh)
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
}
