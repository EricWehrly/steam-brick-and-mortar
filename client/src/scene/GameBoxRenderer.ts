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

export interface GameBoxDimensions {
    width: number
    height: number
    depth: number
}

export interface GameBoxPosition {
    x: number
    y: number
    z: number
}

export interface ShelfConfiguration {
    surfaceY: number
    centerZ: number
    centerX: number
    spacing: number
}

// Generic game data interface - not specific to Steam
export interface GameData {
    id: string | number
    name: string
    playtime: number
    recentPlaytime?: number
    // Artwork URLs are handled separately via texture options
    // This keeps the renderer agnostic to data source
}

// Legacy Steam interface for backward compatibility
// TODO: Remove this once SteamGameManager is refactored
export interface SteamGameData {
    appid: string | number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    img_icon_url?: string
    img_logo_url?: string
    artwork?: {
        icon: string
        logo: string
        header: string
        library: string
    }
}

// Clean interface contract between GameBoxRenderer and external managers
export interface GameBoxCreationRequest {
    gameData: GameData | SteamGameData
    index: number
    textureOptions?: GameBoxTextureOptions
}

export interface GameBoxBatchCreationRequest {
    games: (GameData | SteamGameData)[]
    batchSize?: number
    enablePerformanceFeatures?: boolean
}

export interface GameBoxTextureOptions {
    artworkBlobs?: Record<string, Blob | null>
    preferredArtworkType?: 'library' | 'header' | 'logo' | 'icon'
    fallbackColor?: number
    enableFallbackTexture?: boolean
    // Performance optimization options (experimental - enable when working with many textures)
    targetResolution?: number
    enableLazyLoading?: boolean
    viewingDistance?: number
}

// Performance management interfaces (experimental - for texture optimization)
export interface TexturePerformanceConfig {
    maxTextureSize: number
    nearDistance: number
    farDistance: number
    highResolutionSize: number
    mediumResolutionSize: number
    lowResolutionSize: number
    maxActiveTextures: number
    frustumCullingEnabled: boolean
}

export interface GameBoxPerformanceData {
    isVisible: boolean
    distanceFromCamera: number
    lastUpdated: number
    textureLoaded: boolean
    currentTextureSize: number
}



export class GameBoxRenderer {
    private static readonly DEFAULT_DIMENSIONS: GameBoxDimensions = {
        width: 0.15,
        height: 0.2,
        depth: 0.02
    }

    // TODO: Guessing at shelf offsets should be removed entirely
    private static readonly DEFAULT_SHELF_CONFIG: ShelfConfiguration = {
        surfaceY: -0.8,
        centerZ: -3,
        centerX: 0,
        spacing: 0.16
    }

    private dimensions: GameBoxDimensions
    private gameBoxGeometry: THREE.BoxGeometry
    private textureLoader: THREE.TextureLoader
    private fallbackTexture: THREE.Texture | null = null

    // Performance management (experimental - enable when working with many textures)
    private performanceConfig: TexturePerformanceConfig
    private activeTextures: Map<string, THREE.Texture> = new Map()
    private gameBoxPerformanceData: Map<string, GameBoxPerformanceData> = new Map()
    private frustum: THREE.Frustum = new THREE.Frustum()
    private cameraMatrix: THREE.Matrix4 = new THREE.Matrix4()

    constructor(
        dimensions: Partial<GameBoxDimensions> = {},
        shelfConfig: Partial<ShelfConfiguration> = {},
        performanceConfig: Partial<TexturePerformanceConfig> = {},
        private sceneManager?: any // Optional SceneManager for consistent scene interaction
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        
        // Initialize performance configuration (experimental features)
        this.performanceConfig = {
            maxTextureSize: 1024,
            nearDistance: 2.0,
            farDistance: 10.0,
            highResolutionSize: 512,
            mediumResolutionSize: 256,
            lowResolutionSize: 128,
            maxActiveTextures: 50,
            frustumCullingEnabled: true,
            ...performanceConfig
        }
        
        this.gameBoxGeometry = new THREE.BoxGeometry(
            this.dimensions.width,
            this.dimensions.height,
            this.dimensions.depth
        )
        
        this.textureLoader = new THREE.TextureLoader()
        this.createFallbackTexture()
    }

    /**
     * Create placeholder game boxes
     */
    public createPlaceholderBoxes(count: number = 6, shelfConfig?: ShelfConfiguration): THREE.Mesh[] {
        
        const materials = this.createPlaceholderMaterials()
        const boxes: THREE.Mesh[] = []
        
        const config = shelfConfig ?? GameBoxRenderer.DEFAULT_SHELF_CONFIG
        const startX = this.calculateStartX(count, config)
        
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
            const position = this.calculateBoxPosition(i, startX, config)
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
        const config = GameBoxRenderer.DEFAULT_SHELF_CONFIG
        const position = this.calculateBoxPosition(index, 0, config)
        gameBox.position.set(position.x, position.y, position.z)
        
        // Enable shadows
        gameBox.castShadow = true
        gameBox.receiveShadow = true
        
        // Apply texture if provided (async operation)
        if (textureOptions) {
            this.applyTexture(gameBox, game, textureOptions).then((success) => {
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
        return 'id' in game ? game.id : game.appid
    }
    
    private getGamePlaytime(game: GameData | SteamGameData): number {
        return 'playtime' in game ? game.playtime : game.playtime_forever
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
        const sortedGames = this.sortAndLimitGames(games)
        const boxes: THREE.Mesh[] = []
        
        // Calculate centering for the entire set of boxes
        const config = GameBoxRenderer.DEFAULT_SHELF_CONFIG
        const startX = this.calculateStartX(sortedGames.length, config)
        
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
        
        // Dispose all active textures
        for (const texture of this.activeTextures.values()) {
            texture.dispose()
        }
        
        // Clear tracking data
        this.activeTextures.clear()
        this.gameBoxPerformanceData.clear()
        
        console.log('🧹 Disposed GameBoxRenderer and all textures')
    }

    /**
     * Create fallback texture for game boxes
     * Simple by default, can be enhanced with procedural generation
     */
    private createFallbackTexture() {
        const size = 128 // Reasonable balance between quality and performance
        const data = new Uint8Array(size * size * 3)
        
        // Create a subtle pattern instead of flat gray
        for (let i = 0; i < data.length; i += 3) {
            const baseColor = 120 + (Math.random() * 20 - 10) // Gray with slight variation
            data[i] = baseColor     // R
            data[i + 1] = baseColor // G
            data[i + 2] = baseColor // B
        }
        
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat)
        texture.needsUpdate = true
        this.fallbackTexture = texture
    }

    /**
     * Apply texture to a game box mesh
     */
    public async applyTexture(
        mesh: THREE.Mesh, 
        game: GameData | SteamGameData, 
        options: GameBoxTextureOptions = {}
    ): Promise<boolean> {
        // Dispose of existing texture
        if (mesh.userData.texture) {
            mesh.userData.texture.dispose()
        }
        
        const { artworkBlobs, fallbackColor, enableFallbackTexture } = options
        
        // Early return if no artwork blobs provided
        if (!artworkBlobs) {
            this.applyFallbackToMesh(mesh, fallbackColor, enableFallbackTexture)
            return false
        }

        // Try to get artwork blob (prioritize library > header > logo > icon)
        const artworkTypes = ['library', 'header', 'logo', 'icon'] as const
        let selectedBlob: Blob | null = null
        
        for (const artworkType of artworkTypes) {
            const blob = artworkBlobs[artworkType]
            if (blob) {
                selectedBlob = blob
                break
            }
        }

        if (!selectedBlob) {
            this.applyFallbackToMesh(mesh, fallbackColor, enableFallbackTexture)
            return false
        }

        try {
            const texture = await this.createTextureFromBlob(selectedBlob)
            
            // Apply texture to the game box - properly type the material
            const material = mesh.material as THREE.MeshPhongMaterial
            if (material && material instanceof THREE.MeshPhongMaterial) {
                material.map = texture
                material.color.set(0xffffff) // Reset color to white for proper texture display
                material.needsUpdate = true
                mesh.userData.texture = texture
            }
            
            return true
        } catch (error) {
            console.warn('⚠️ Failed to create texture from blob:', error)
            this.applyFallbackToMesh(mesh, fallbackColor, enableFallbackTexture)
            return false
        }
    }

    /**
     * Create a Three.js texture from a Blob
     */
    private async createTextureFromBlob(blob: Blob): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            const objectUrl = URL.createObjectURL(blob)
            
            this.textureLoader.load(
                objectUrl,
                (texture) => {
                    // Configure texture for optimal quality
                    texture.anisotropy = Math.min(16, this.textureLoader.crossOrigin ? 16 : 4)
                    texture.wrapS = THREE.ClampToEdgeWrapping
                    texture.wrapT = THREE.ClampToEdgeWrapping
                    texture.minFilter = THREE.LinearFilter
                    texture.magFilter = THREE.LinearFilter
                    texture.needsUpdate = true
                    
                    // Clean up the object URL
                    URL.revokeObjectURL(objectUrl)
                    resolve(texture)
                },
                undefined,
                (error) => {
                    URL.revokeObjectURL(objectUrl)
                    reject(error)
                }
            )
        })
    }

    /**
     * Apply fallback appearance to a mesh
     */
    private applyFallbackToMesh(
        mesh: THREE.Mesh, 
        fallbackColor?: number, 
        enableFallbackTexture = true
    ): void {
        const material = mesh.material as THREE.MeshPhongMaterial
        
        if (enableFallbackTexture && this.fallbackTexture && material instanceof THREE.MeshPhongMaterial) {
            // Apply fallback texture pattern
            material.map = this.fallbackTexture
            material.color.set(0xffffff)
            material.needsUpdate = true
        } else if (material instanceof THREE.MeshPhongMaterial) {
            // Apply solid color fallback
            const color = fallbackColor ?? 0x808080 // Default gray
            material.map = null // Remove any existing texture
            material.color.set(color)
            material.needsUpdate = true
        }
    }

    // ====================================================================
    // EXPERIMENTAL PERFORMANCE FEATURES
    // These features are designed for handling large numbers of textured game boxes
    // Enable them when you start working with Steam artwork textures
    // ====================================================================

    /**
     * Update performance data for all game boxes based on camera position
     * (Experimental - enable when working with many textured game boxes)
     */
    public updatePerformanceData(camera: THREE.Camera, scene: THREE.Scene): void {
        if (!this.performanceConfig.frustumCullingEnabled) return

        // Update frustum from camera
        this.cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        this.frustum.setFromProjectionMatrix(this.cameraMatrix)

        // Find all game boxes in scene
        const gameBoxes = scene.children.filter(child => 
            child.userData?.isGameBox && child instanceof THREE.Mesh
        ) as THREE.Mesh[]

        for (const gameBox of gameBoxes) {
            const gameId = gameBox.userData.gameId?.toString() ?? gameBox.userData.name ?? 'unknown'
            
            // Calculate distance from camera
            const distance = camera.position.distanceTo(gameBox.position)
            
            // Check if object is in camera frustum
            const isVisible = this.frustum.containsPoint(gameBox.position)
            
            // Update or create performance data
            const performanceData: GameBoxPerformanceData = {
                isVisible,
                distanceFromCamera: distance,
                lastUpdated: Date.now(),
                textureLoaded: gameBox.userData.textureLoaded ?? false,
                currentTextureSize: gameBox.userData.currentTextureSize ?? 0
            }
            
            this.gameBoxPerformanceData.set(gameId, performanceData)
            
            // Update game box user data
            gameBox.userData.isVisible = isVisible
            gameBox.userData.distanceFromCamera = distance
        }
    }

    /**
     * Get optimal texture resolution based on viewing distance
     * (Experimental - for dynamic texture quality)
     */
    private getOptimalTextureResolution(distance: number): number {
        const { nearDistance, farDistance, highResolutionSize, mediumResolutionSize, lowResolutionSize } = this.performanceConfig
        
        if (distance <= nearDistance) {
            return highResolutionSize
        } else if (distance <= farDistance) {
            return mediumResolutionSize
        } else {
            return lowResolutionSize
        }
    }

    /**
     * Create texture at specific resolution from blob
     * (Experimental - for performance optimization)
     */
    private async createOptimizedTexture(blob: Blob, targetResolution: number): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            const img = new globalThis.Image()
            img.onload = () => {
                // Create canvas for resizing
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                
                if (!ctx) {
                    reject(new Error('Could not get canvas context'))
                    return
                }
                
                // Calculate optimal size maintaining aspect ratio
                const aspectRatio = img.width / img.height
                let width = targetResolution
                let height = targetResolution / aspectRatio
                
                if (height > targetResolution) {
                    height = targetResolution
                    width = targetResolution * aspectRatio
                }
                
                canvas.width = width
                canvas.height = height
                
                // Draw and resize image
                ctx.drawImage(img, 0, 0, width, height)
                
                // Create texture from canvas
                const texture = new THREE.CanvasTexture(canvas)
                texture.minFilter = THREE.LinearFilter
                texture.magFilter = THREE.LinearFilter
                texture.generateMipmaps = false
                
                resolve(texture)
                
                // Clean up
                URL.revokeObjectURL(img.src)
            }
            
            img.onerror = () => {
                URL.revokeObjectURL(img.src)
                reject(new Error('Failed to load image'))
            }
            
            img.src = URL.createObjectURL(blob)
        })
    }

    /**
     * Apply texture with performance optimization
     * (Experimental - use when you need dynamic texture quality based on distance)
     */
    public async applyOptimizedTexture(
        mesh: THREE.Mesh, 
        game: GameData | SteamGameData, 
        options: GameBoxTextureOptions = {}
    ): Promise<boolean> {
        const gameId = this.getGameId(game).toString()
        const performanceData = this.gameBoxPerformanceData.get(gameId)
        
        // Skip if not visible and lazy loading is enabled
        if (options.enableLazyLoading && performanceData && !performanceData.isVisible) {
            console.debug(`Skipping texture load for off-screen game: ${game.name}`)
            return false
        }
        
        // Determine optimal resolution
        const targetResolution = options.targetResolution ?? 
            this.getOptimalTextureResolution(options.viewingDistance ?? performanceData?.distanceFromCamera ?? 5.0)
        
        // Check if we already have a suitable texture
        const existingTexture = this.activeTextures.get(`${gameId}_${targetResolution}`)
        if (existingTexture && mesh.userData.currentTextureSize === targetResolution) {
            return true
        }
        
        const { artworkBlobs, enableFallbackTexture } = options
        
        if (!artworkBlobs) {
            this.applyFallbackToMesh(mesh, options.fallbackColor, enableFallbackTexture)
            return false
        }
        
        // Try to get artwork blob (prioritize library > header > logo > icon)
        const artworkTypes = ['library', 'header', 'logo', 'icon'] as const
        let selectedBlob: Blob | null = null
        
        for (const artworkType of artworkTypes) {
            const blob = artworkBlobs[artworkType]
            if (blob) {
                selectedBlob = blob
                break
            }
        }
        
        if (!selectedBlob) {
            this.applyFallbackToMesh(mesh, options.fallbackColor, enableFallbackTexture)
            return false
        }
        
        try {
            // Create optimized texture
            const texture = await this.createOptimizedTexture(selectedBlob, targetResolution)
            
            // Dispose of existing texture
            if (mesh.userData.texture) {
                mesh.userData.texture.dispose()
                this.activeTextures.delete(mesh.userData.textureKey)
            }
            
            // Apply new texture
            const material = mesh.material as THREE.MeshPhongMaterial
            material.map = texture
            material.needsUpdate = true
            
            // Track texture
            const textureKey = `${gameId}_${targetResolution}`
            this.activeTextures.set(textureKey, texture)
            
            // Update mesh user data
            mesh.userData.texture = texture
            mesh.userData.textureKey = textureKey
            mesh.userData.textureLoaded = true
            mesh.userData.currentTextureSize = targetResolution
            
            // Update performance data
            if (performanceData) {
                performanceData.textureLoaded = true
                performanceData.currentTextureSize = targetResolution
            }
            
            console.log(`🖼️ Applied optimized texture (${targetResolution}px) to: ${game.name}`)
            return true
            
        } catch (error) {
            console.warn(`⚠️ Failed to create optimized texture for ${game.name}:`, error)
            this.applyFallbackToMesh(mesh, options.fallbackColor, enableFallbackTexture)
            return false
        }
    }

    /**
     * Clean up textures for off-screen or distant objects
     * (Experimental - for memory management with many textures)
     */
    public cleanupOffScreenTextures(): void {
        const now = Date.now()
        const cleanupThreshold = 30000 // 30 seconds
        
        for (const [gameId, performanceData] of this.gameBoxPerformanceData.entries()) {
            // Clean up if object has been off-screen for a while
            if (!performanceData.isVisible && 
                (now - performanceData.lastUpdated) > cleanupThreshold &&
                performanceData.textureLoaded) {
                
                this.unloadTextureForGame(gameId)
            }
        }
        
        // Enforce maximum active texture limit
        if (this.activeTextures.size > this.performanceConfig.maxActiveTextures) {
            this.enforceTextureMemoryLimit()
        }
    }

    /**
     * Unload texture for a specific game
     * (Experimental - internal memory management)
     */
    private unloadTextureForGame(gameId: string): void {
        // Find textures for this game
        const textureKeys = Array.from(this.activeTextures.keys()).filter(key => key.startsWith(gameId))
        
        for (const key of textureKeys) {
            const texture = this.activeTextures.get(key)
            if (texture) {
                texture.dispose()
                this.activeTextures.delete(key)
                console.debug(`🧹 Unloaded texture for off-screen game: ${gameId}`)
            }
        }
        
        // Update performance data
        const performanceData = this.gameBoxPerformanceData.get(gameId)
        if (performanceData) {
            performanceData.textureLoaded = false
            performanceData.currentTextureSize = 0
        }
    }

    /**
     * Enforce memory limits by removing least recently used textures
     * (Experimental - internal memory management)
     */
    private enforceTextureMemoryLimit(): void {
        const sortedGames = Array.from(this.gameBoxPerformanceData.entries())
            .filter(([_, data]) => data.textureLoaded)
            .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated) // Sort by last updated (oldest first)
        
        const gamesToRemove = this.activeTextures.size - this.performanceConfig.maxActiveTextures
        
        for (let i = 0; i < gamesToRemove && i < sortedGames.length; i++) {
            const [gameId] = sortedGames[i]
            this.unloadTextureForGame(gameId)
        }
        
        console.log(`🧹 Enforced texture memory limit: removed ${gamesToRemove} textures`)
    }

    /**
     * Get comprehensive performance statistics
     * (Experimental - for monitoring texture performance)
     */
    public getPerformanceStats(): {
        totalGameBoxes: number
        visibleGameBoxes: number
        loadedTextures: number
        activeTextures: number
        averageDistance: number
    } {
        const data = Array.from(this.gameBoxPerformanceData.values())
        const visibleData = data.filter(d => d.isVisible)
        const loadedTextures = data.filter(d => d.textureLoaded).length
        const averageDistance = data.length > 0 
            ? data.reduce((sum, d) => sum + d.distanceFromCamera, 0) / data.length 
            : 0
        
        return {
            totalGameBoxes: data.length,
            visibleGameBoxes: visibleData.length,
            loadedTextures,
            activeTextures: this.activeTextures.size,
            averageDistance
        }
    }

}
