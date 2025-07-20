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
    maxGames: number
    spacing: number
}

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

export interface GameBoxTextureOptions {
    artworkBlobs?: Record<string, Blob | null>
    preferredArtworkType?: 'library' | 'header' | 'logo' | 'icon'
    fallbackColor?: number
    enableFallbackTexture?: boolean
    // Performance optimization options
    targetResolution?: number
    enableLazyLoading?: boolean
    viewingDistance?: number
}

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

    private static readonly DEFAULT_SHELF_CONFIG: ShelfConfiguration = {
        surfaceY: -0.8,
        centerZ: -3,
        centerX: 0,
        maxGames: 100, // Increased from 12 to support larger libraries
        spacing: 0.16
    }

    private dimensions: GameBoxDimensions
    private shelfConfig: ShelfConfiguration
    private gameBoxGeometry: THREE.BoxGeometry
    private textureLoader: THREE.TextureLoader
    private fallbackTexture: THREE.Texture | null = null

    // Performance management
    private performanceConfig: TexturePerformanceConfig
    private activeTextures: Map<string, THREE.Texture> = new Map()
    private gameBoxPerformanceData: Map<string, GameBoxPerformanceData> = new Map()
    private frustum: THREE.Frustum = new THREE.Frustum()
    private cameraMatrix: THREE.Matrix4 = new THREE.Matrix4()

    constructor(
        dimensions: Partial<GameBoxDimensions> = {},
        shelfConfig: Partial<ShelfConfiguration> = {},
        performanceConfig: Partial<TexturePerformanceConfig> = {}
    ) {
        this.dimensions = { ...GameBoxRenderer.DEFAULT_DIMENSIONS, ...dimensions }
        this.shelfConfig = { ...GameBoxRenderer.DEFAULT_SHELF_CONFIG, ...shelfConfig }
        
        // Initialize performance configuration
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
    public createPlaceholderBoxes(scene: THREE.Scene, count: number = 6): THREE.Mesh[] {
        console.log(`📦 Creating ${count} placeholder game boxes...`)
        
        const materials = this.createPlaceholderMaterials()
        const boxes: THREE.Mesh[] = []
        
        const startX = this.calculateStartX(count)
        
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
            const position = this.calculateBoxPosition(i, startX)
            gameBox.position.set(position.x, position.y, position.z)
            
            // Enable shadows
            gameBox.castShadow = true
            gameBox.receiveShadow = true
            
            // Add subtle random rotation for natural look
            gameBox.rotation.y = (Math.random() - 0.5) * 0.1
            
            scene.add(gameBox)
            boxes.push(gameBox)
        }
        
        console.log(`✅ Created ${count} placeholder game boxes`)
        return boxes
    }

    /**
     * Create a game box from Steam data
     */
    public createGameBox(
        scene: THREE.Scene, 
        game: SteamGameData, 
        index: number
    ): THREE.Mesh | null {
        return this.createGameBoxWithTexture(scene, game, index)
    }

    /**
     * Create a game box from Steam data with optional texture support
     */
    public createGameBoxWithTexture(
        scene: THREE.Scene, 
        game: SteamGameData, 
        index: number,
        textureOptions?: GameBoxTextureOptions
    ): THREE.Mesh | null {
        // Check if we're within display limits
        if (index >= this.shelfConfig.maxGames) {
            return null
        }

        // Create material - start with fallback color for immediate display
        const colorHue = ValidationUtils.stringToHue(game.name)
        const material = new THREE.MeshPhongMaterial({ 
            color: new THREE.Color().setHSL(colorHue, 0.7, 0.5)
        })
        
        const gameBox = new THREE.Mesh(this.gameBoxGeometry, material)
        
        // Mark as game box with Steam data
        gameBox.userData = { 
            isGameBox: true, 
            steamGame: game,
            appId: game.appid,
            name: game.name,
            playtime: game.playtime_forever
        }
        
        // Position the box
        const startX = this.calculateStartX(this.shelfConfig.maxGames)
        const position = this.calculateBoxPosition(index, startX)
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
        
        // Add to scene
        scene.add(gameBox)
        
        console.log(`📦 Added game box ${index}: ${game.name}`)
        return gameBox
    }

    /**
     * Create game boxes from Steam library data
     */
    public createGameBoxesFromSteamData(
        scene: THREE.Scene, 
        games: SteamGameData[]
    ): THREE.Mesh[] {
        console.log(`🎮 Creating game boxes from ${games.length} Steam games...`)
        
        if (!games || games.length === 0) {
            console.warn('⚠️ No games provided for game box creation')
            return []
        }

        // Sort and limit games
        const sortedGames = this.sortAndLimitGames(games)
        const boxes: THREE.Mesh[] = []
        
        // Create game boxes
        sortedGames.forEach((game, index) => {
            const box = this.createGameBox(scene, game, index)
            if (box) {
                boxes.push(box)
            }
        })
        
        console.log(`✅ Created ${boxes.length} game boxes from Steam library`)
        return boxes
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
     * Update shelf configuration
     */
    public updateShelfConfig(newConfig: Partial<ShelfConfiguration>) {
        this.shelfConfig = { ...this.shelfConfig, ...newConfig }
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

    private createPlaceholderMaterials(): THREE.MeshPhongMaterial[] {
        return [
            new THREE.MeshPhongMaterial({ color: 0x4a90e2 }), // Blue
            new THREE.MeshPhongMaterial({ color: 0xe74c3c }), // Red  
            new THREE.MeshPhongMaterial({ color: 0x2ecc71 }), // Green
            new THREE.MeshPhongMaterial({ color: 0xf39c12 }), // Orange
            new THREE.MeshPhongMaterial({ color: 0x9b59b6 }), // Purple
            new THREE.MeshPhongMaterial({ color: 0x1abc9c }), // Teal
        ]
    }

    private calculateStartX(numBoxes: number): number {
        return -(numBoxes - 1) * this.shelfConfig.spacing / 2
    }

    private calculateBoxPosition(index: number, startX: number): GameBoxPosition {
        return {
            x: this.shelfConfig.centerX + startX + (index * this.shelfConfig.spacing),
            y: this.shelfConfig.surfaceY + this.dimensions.height / 2,
            z: this.shelfConfig.centerZ + 0.08
        }
    }

    private sortAndLimitGames(games: SteamGameData[]): SteamGameData[] {
        // Get games with recent playtime first, then alphabetical
        const playedGames = games
            .filter(game => game.playtime_forever > 0)
            .sort((a, b) => b.playtime_forever - a.playtime_forever)
            .slice(0, this.shelfConfig.maxGames)
        
        // If we don't have enough played games, fill with unplayed games
        if (playedGames.length < this.shelfConfig.maxGames) {
            const unplayedGames = games
                .filter(game => game.playtime_forever === 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .slice(0, this.shelfConfig.maxGames - playedGames.length)
            
            playedGames.push(...unplayedGames)
        }
        
        return playedGames
    }

    /**
     * Dispose of resources
     */
    public dispose() {
        this.gameBoxGeometry.dispose()
    }

    /**
     * Create fallback texture for game boxes
     */
    private createFallbackTexture() {
        const size = 512
        const data = new Uint8Array(size * size * 3)
        for (let i = 0; i < data.length; i += 3) {
            const color = (Math.random() * 0.5 + 0.5) * 255
            data[i] = color // R
            data[i + 1] = color // G
            data[i + 2] = color // B
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
        game: SteamGameData, 
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

    /**
     * Update performance data for all game boxes based on camera position
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
            const gameId = gameBox.userData.appId?.toString() ?? gameBox.userData.name ?? 'unknown'
            
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
     */
    public async applyOptimizedTexture(
        mesh: THREE.Mesh, 
        game: SteamGameData, 
        options: GameBoxTextureOptions = {}
    ): Promise<boolean> {
        const gameId = game.appid?.toString() ?? game.name
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
     * Get performance statistics
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
