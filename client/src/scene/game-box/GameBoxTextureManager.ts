/**
 * GameBox Texture Manager
 * 
 * Handles all texture-related operations for game boxes:
 * - Texture loading from blobs
 * - Fallback texture creation and application
 * - Texture optimization and caching
 * - Integration with performance management
 */

import * as THREE from 'three'
import type { GameData, SteamGameData } from './types/GameData'
import type { GameBoxTextureOptions } from './types/GameBoxOptions'
import type { GameBoxPerformanceManager } from './GameBoxPerformanceManager'

export class GameBoxTextureManager {
    private textureLoader: THREE.TextureLoader
    private fallbackTexture: THREE.Texture | null = null
    private performanceManager?: GameBoxPerformanceManager

    constructor(performanceManager?: GameBoxPerformanceManager) {
        this.textureLoader = new THREE.TextureLoader()
        this.performanceManager = performanceManager
        this.createFallbackTexture()
    }

    /**
     * Set or update the performance manager
     */
    public setPerformanceManager(performanceManager: GameBoxPerformanceManager): void {
        this.performanceManager = performanceManager
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
     * Apply texture with performance optimization
     * (Experimental - use when you need dynamic texture quality based on distance)
     */
    public async applyOptimizedTexture(
        mesh: THREE.Mesh, 
        game: GameData | SteamGameData, 
        options: GameBoxTextureOptions = {}
    ): Promise<boolean> {
        if (!this.performanceManager) {
            // Fall back to regular texture application if no performance manager
            return this.applyTexture(mesh, game, options)
        }

        const gameId = this.getGameId(game).toString()
        const performanceData = this.performanceManager.getPerformanceData(gameId)
        
        // Skip if not visible and lazy loading is enabled
        if (this.performanceManager.shouldSkipTextureLoading(gameId, options.enableLazyLoading ?? false)) {
            console.debug(`Skipping texture load for off-screen game: ${game.name}`)
            return false
        }
        
        // Determine optimal resolution
        const targetResolution = options.targetResolution ?? 
            this.performanceManager.getOptimalTextureResolution(
                options.viewingDistance ?? performanceData?.distanceFromCamera ?? 5.0
            )
        
        // Check if we already have a suitable texture
        if (this.performanceManager.hasSuitableTexture(gameId, targetResolution, mesh)) {
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
            // Create optimized texture using performance manager
            const texture = await this.performanceManager.createOptimizedTexture(selectedBlob, targetResolution)
            
            // Dispose of existing texture
            if (mesh.userData.texture) {
                mesh.userData.texture.dispose()
            }
            
            // Apply new texture
            const material = mesh.material as THREE.MeshPhongMaterial
            material.map = texture
            material.needsUpdate = true
            
            // Track texture with performance manager
            const textureKey = `${gameId}_${targetResolution}`
            this.performanceManager.trackTexture(textureKey, texture)
            
            // Update mesh user data
            mesh.userData.texture = texture
            mesh.userData.textureKey = textureKey
            mesh.userData.textureLoaded = true
            mesh.userData.currentTextureSize = targetResolution
            
            // Update performance data
            this.performanceManager.updateTextureLoadedData(gameId, targetResolution)
            
            console.log(`🖼️ Applied optimized texture (${targetResolution}px) to: ${game.name}`)
            return true
            
        } catch (error) {
            console.warn(`⚠️ Failed to create optimized texture for ${game.name}:`, error)
            this.applyFallbackToMesh(mesh, options.fallbackColor, enableFallbackTexture)
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
     * Create fallback texture for game boxes
     * Simple by default, can be enhanced with procedural generation
     */
    private createFallbackTexture(): void {
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
     * Helper method to get game ID from different game data formats
     */
    private getGameId(game: GameData | SteamGameData): string | number {
        return 'id' in game ? game.id : game.appid
    }

    /**
     * Dispose of all textures and resources
     */
    public dispose(): void {
        if (this.fallbackTexture) {
            this.fallbackTexture.dispose()
            this.fallbackTexture = null
        }
        
        console.log('🧹 Disposed GameBoxTextureManager resources')
    }
}