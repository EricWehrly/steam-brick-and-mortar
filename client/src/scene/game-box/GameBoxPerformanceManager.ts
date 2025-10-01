/**
 * GameBox Performance Manager
 * 
 * Handles experimental performance features for game box rendering:
 * - Frustum culling for visibility optimization
 * - Distance-based texture resolution scaling
 * - Texture memory management and cleanup
 * - Performance statistics and monitoring
 * 
 * These features are designed for handling large numbers of textured game boxes.
 * Enable them when working with Steam artwork textures.
 */

import * as THREE from 'three'
import type { 
    TexturePerformanceConfig, 
    GameBoxPerformanceData, 
    PerformanceStats 
} from './types/PerformanceTypes'

export class GameBoxPerformanceManager {
    private performanceConfig: TexturePerformanceConfig
    private activeTextures: Map<string, THREE.Texture> = new Map()
    private gameBoxPerformanceData: Map<string, GameBoxPerformanceData> = new Map()
    private frustum: THREE.Frustum = new THREE.Frustum()
    private cameraMatrix: THREE.Matrix4 = new THREE.Matrix4()

    constructor(config: Partial<TexturePerformanceConfig> = {}) {
        // Initialize performance configuration with sensible defaults
        this.performanceConfig = {
            maxTextureSize: 1024,
            nearDistance: 2.0,
            farDistance: 10.0,
            highResolutionSize: 512,
            mediumResolutionSize: 256,
            lowResolutionSize: 128,
            maxActiveTextures: 50,
            frustumCullingEnabled: true,
            ...config
        }
    }

    /**
     * Get the current performance configuration
     */
    public getConfig(): TexturePerformanceConfig {
        return { ...this.performanceConfig }
    }

    /**
     * Update performance configuration
     */
    public updateConfig(config: Partial<TexturePerformanceConfig>): void {
        this.performanceConfig = { ...this.performanceConfig, ...config }
    }

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
    public getOptimalTextureResolution(distance: number): number {
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
     * Check if a game should skip texture loading due to lazy loading rules
     */
    public shouldSkipTextureLoading(gameId: string, enableLazyLoading: boolean): boolean {
        if (!enableLazyLoading) return false
        
        const performanceData = this.gameBoxPerformanceData.get(gameId)
        return performanceData ? !performanceData.isVisible : false
    }

    /**
     * Get performance data for a specific game
     */
    public getPerformanceData(gameId: string): GameBoxPerformanceData | undefined {
        return this.gameBoxPerformanceData.get(gameId)
    }

    /**
     * Create texture at specific resolution from blob
     * (Experimental - for performance optimization)
     */
    public async createOptimizedTexture(blob: Blob, targetResolution: number): Promise<THREE.Texture> {
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
     * Track a texture for performance management
     */
    public trackTexture(textureKey: string, texture: THREE.Texture): void {
        this.activeTextures.set(textureKey, texture)
    }

    /**
     * Get a tracked texture
     */
    public getTrackedTexture(textureKey: string): THREE.Texture | undefined {
        return this.activeTextures.get(textureKey)
    }

    /**
     * Check if we already have a suitable texture for a game
     */
    public hasSuitableTexture(gameId: string, targetResolution: number, mesh: THREE.Mesh): boolean {
        const textureKey = `${gameId}_${targetResolution}`
        const existingTexture = this.activeTextures.get(textureKey)
        return existingTexture !== undefined && mesh.userData.currentTextureSize === targetResolution
    }

    /**
     * Update performance data for a game when texture is loaded
     */
    public updateTextureLoadedData(gameId: string, textureSize: number): void {
        const performanceData = this.gameBoxPerformanceData.get(gameId)
        if (performanceData) {
            performanceData.textureLoaded = true
            performanceData.currentTextureSize = textureSize
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
    public getPerformanceStats(): PerformanceStats {
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

    /**
     * Dispose of all tracked textures and clear performance data
     */
    public dispose(): void {
        // Dispose all active textures
        for (const texture of this.activeTextures.values()) {
            texture.dispose()
        }
        
        // Clear tracking data
        this.activeTextures.clear()
        this.gameBoxPerformanceData.clear()
        
        console.log('🧹 Disposed GameBoxPerformanceManager and all tracked textures')
    }
}