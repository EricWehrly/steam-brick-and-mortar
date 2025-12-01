/**
 * Instanced Artwork Renderer - GPU Instancing for Game Artwork
 * 
 * Renders game boxes with Steam artwork using GPU instancing for optimal performance.
 * Complements InstancedLabelRenderer by handling artwork while labels handle text.
 * 
 * Performance Impact:
 * - Before: N games with artwork = N draw calls
 * - After: N games with artwork = 1 draw call total
 * 
 * Usage:
 * 1. Create with maximum expected instances
 * 2. Set artwork instances via setArtworkInstance() with texture blobs
 * 3. Call updateGPU() to apply changes
 * 
 * Architecture:
 * - Uses THREE.DataArrayTexture for artwork textures
 * - Separate from InstancedLabelRenderer for clean separation of concerns
 * - Maintains 1-2 draw calls total (labels + artwork)
 */

import * as THREE from 'three'
import type { GameBoxTextureOptions } from '../types/GameBoxOptions'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey, DataDomain } from '../../../core/data/DataTypes'
import { TextureProcessor } from './TextureProcessor'
import type { InstanceMetadata } from '../../../debug/GameFinder'
import { InstancedArtworkDebugger } from './InstancedArtworkDebugger'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'
import vertexShader from './shaders/instanced-artwork.vert?raw'
import fragmentShader from './shaders/instanced-artwork.frag?raw'

export interface InstancedArtworkConfig {
    maxInstances?: number
    textureSize?: number
    maxTextures?: number  // Max texture array layers (default: 1024, WebGL2 typically supports 2048)
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    enablePerformanceLogging?: boolean
}

export const INSTANCED_ARTWORK_MESH_NAME = 'gpu-instanced-artwork-boxes' as const

export class InstancedArtworkRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // Texture management
    private dataArrayTexture: THREE.DataArrayTexture | null = null
    private textureProcessor: TextureProcessor
    
    // Instance metadata (for game finding/debugging)
    private _instanceMetadata: Map<number, InstanceMetadata> = new Map()
    
    // Configuration
    private readonly maxInstances: number
    private readonly textureSize: number
    private readonly maxTextures: number
    
    // State tracking
    private currentCount: number = 0
    private isInitialized: boolean = false
    
    // Constant quaternion for no rotation (performance optimization)
    private static readonly DEFAULT_ROTATION = new THREE.Quaternion() // Identity quaternion (0,0,0,1)
    
    // Box dimensions
    private readonly dimensions: { width: number, height: number, depth: number }
    
    constructor(config: InstancedArtworkConfig = {}) {
        this.maxInstances = config.maxInstances || 1000
        this.textureSize = config.textureSize || 512
        // WebGL2 typically supports 2048 layers, 1024 is conservative default
        this.maxTextures = config.maxTextures || 1024
        
        this.dimensions = {
            width: config.boxWidth || 0.3,
            height: config.boxHeight || 0.4,
            depth: config.boxDepth || 0.1
        }
        
        // Initialize texture processor
        this.textureProcessor = new TextureProcessor({
            textureSize: this.textureSize,
            maxTextures: this.maxTextures,
            enablePerformanceLogging: config.enablePerformanceLogging
        })
        
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, this.updateGPU.bind(this))
        
        console.debug(`🎨 InstancedArtworkRenderer created (max: ${this.maxInstances} instances, ${this.maxTextures} textures)`)
    }
    
    public initialize(): void {
        if (this.isInitialized) {
            console.warn('InstancedArtworkRenderer already initialized')
            return
        }
        
        try {
            // Create empty data array texture that we'll populate dynamically
            this.createEmptyTextureArray()
            
            // Create material with texture array
            this.material = this.createArtworkMaterial()
            
            // Create geometry and instanced mesh
            this.geometry = new THREE.BoxGeometry(
                this.dimensions.width,
                this.dimensions.height,
                this.dimensions.depth
            )
            
            this.instancedMesh = new THREE.InstancedMesh(
                this.geometry,
                this.material,
                this.maxInstances
            )
            
            // Name the mesh for debugging
            this.instancedMesh.name = INSTANCED_ARTWORK_MESH_NAME
            
            // CRITICAL: Set count to 0 initially
            this.instancedMesh.count = 0
            
            // Enable shadows and visibility
            this.instancedMesh.castShadow = true
            this.instancedMesh.receiveShadow = true
            this.instancedMesh.visible = true
            
            // Disable frustum culling to prevent disappearing when close
            this.instancedMesh.frustumCulled = false
            
            // Position at world origin
            this.instancedMesh.position.set(0, 0, 0)
            this.instancedMesh.rotation.set(0, 0, 0)
            this.instancedMesh.scale.set(1, 1, 1)
            
            this.setupInstanceAttributes()
            
            this.isInitialized = true
            
            // Register metadata Map in DataManager once (will be mutated directly, not re-set)
            DataManager.getInstance().set(
                DataKey.InstancedArtworkMetadata, 
                this._instanceMetadata,
                { domain: DataDomain.Renderer, description: 'Instanced artwork instance metadata' }
            )
            
            // Automatically add to main scene if available
            this.addToMainScene()
            
            console.log('✅ InstancedArtworkRenderer initialized')
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedArtworkRenderer:', error)
            throw error
        }
    }
    
    /**
     * Create empty texture array for dynamic population
     * Uses smaller initial size to avoid blocking main thread
     */
    private createEmptyTextureArray(): void {
        const size = this.textureSize
        const depth = this.maxTextures
        
        // Create minimal empty RGBA data (just allocate, don't fill)
        const data = new Uint8Array(size * size * depth * 4)
        // Skip the expensive fill loop - GPU will handle uninitialized data fine
        
        this.dataArrayTexture = new THREE.DataArrayTexture(data, size, size, depth)
        this.dataArrayTexture.format = THREE.RGBAFormat
        this.dataArrayTexture.type = THREE.UnsignedByteType
        this.dataArrayTexture.minFilter = THREE.LinearFilter
        this.dataArrayTexture.magFilter = THREE.LinearFilter
        this.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
        this.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
        this.dataArrayTexture.needsUpdate = true
    }
    
    private createArtworkMaterial(): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: this.dataArrayTexture }
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.FrontSide
        })
    }
    
    /**
     * Setup instance attributes for texture indexing
     */
    private setupInstanceAttributes(): void {
        if (!this.geometry || !this.instancedMesh) {
            throw new Error('Geometry or instancedMesh not initialized')
        }
        
        // Create texture index attribute for per-instance texture selection
        const textureIndices = new Float32Array(this.maxInstances)
        textureIndices.fill(0) // Default to first texture slot
        
        const textureIndexAttribute = new THREE.InstancedBufferAttribute(textureIndices, 1)
        textureIndexAttribute.setUsage(THREE.DynamicDrawUsage)
        this.geometry.setAttribute('textureIndex', textureIndexAttribute)
    }
    
    public async setArtworkInstance(
        index: number,
        position: THREE.Vector3,
        gameName: string,
        textureOptions: GameBoxTextureOptions
    ): Promise<boolean> {
        // Lazy initialization - initialize on first use to avoid blocking startup
        if (!this.isInitialized) {
            this.initialize()
        }
        
        if (!this.instancedMesh || !this.geometry) {
            console.warn('InstancedArtworkRenderer failed to initialize')
            return false
        }
        
        if (index >= this.maxInstances) {
            console.warn(`Instance index ${index} exceeds max ${this.maxInstances}`)
            return false
        }
        
        try {
            
            // Get artwork blob
            const artworkBlobs = textureOptions.artworkBlobs
            const preferredType = textureOptions.preferredArtworkType || 'header'
            
            const blob = artworkBlobs?.[preferredType]
            
            if (!blob) {
                console.warn(`❌ [Renderer] No artwork blob found for type "${preferredType}" in game "${gameName}". Available types:`, artworkBlobs ? Object.keys(artworkBlobs) : 'none')
                console.warn(`🔍 [Renderer] Full textureOptions for "${gameName}":`, textureOptions)
                return false
            }
            
            console.debug(`📦 [Renderer] Found blob for "${gameName}": ${blob.size}b (${preferredType})`)
            
            // Add texture to array and get index
            const textureIndex = await this.textureProcessor.processTexture(blob, gameName, this.dataArrayTexture)
            console.debug(`🎨 [Renderer] Texture processed for "${gameName}" → textureIndex=${textureIndex}`)
            
            // Check for suspicious positions
            if (position.x === 0 && position.y === 0 && position.z === 0) {
                console.warn(`⚠️ Game "${gameName}" positioned at origin (0,0,0) - this might be unintended!`)
                console.warn(`🔍 Position details:`, { position, index, textureIndex })
            }
            
            // Update matrix for this instance
            const matrix = new THREE.Matrix4()
            matrix.compose(position, InstancedArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
            this.instancedMesh.setMatrixAt(index, matrix)
            
            // Update texture index attribute
            const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(index, textureIndex)
            
            // Track highest index used
            this.currentCount = Math.max(this.currentCount, index + 1)
            
            // Store instance metadata for game finding (mutates the Map already registered in DataManager)
            this.instanceMetadata.set(index, {
                name: gameName,
                appid: textureOptions.appid,
                position: position.clone()
            })
            
            // Validate geometry visibility after update
            this.validateInstanceVisibility(index, gameName, textureIndex)
            
            if (position.y < 0.1) {
                console.warn(`⚠️ Game "${gameName}" has low Y position: ${position.y.toFixed(2)} - might be on floor`)
            }
            return true
            
        } catch (error) {
            console.error(`❌ [Renderer] Failed to set artwork instance for "${gameName}":`, error)
            return false
        }
    }

    public updateGPU(): void {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) {
            return
        }
        
        // Batch update: mark texture array dirty (uploads to GPU)
        if (this.dataArrayTexture) {
            this.dataArrayTexture.needsUpdate = true
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        console.debug(`🔄 GPU updated: ${this.currentCount} active artwork instances`)
    }
    
    public get instanceMetadata(): Map<number, InstanceMetadata> {
        return this._instanceMetadata
    }
    
    public reset(): void {
        this.currentCount = 0
        this._instanceMetadata.clear()
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
        console.debug('🔄 Artwork instances reset')
    }
    
    /**
     * Automatically add instanced mesh to main scene via DataManager
     */
    private addToMainScene(): void {
        if (!this.instancedMesh) {
            console.warn('⚠️ Cannot add to scene: instancedMesh not initialized')
            return
        }
        
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
        if (!scene) {
            console.warn('⚠️ Cannot add to scene: main scene not available in DataManager')
            return
        }
        
        scene.add(this.instancedMesh)
    }

    /**
     * Validate that an instance is properly visible and has valid geometry
     */
    private validateInstanceVisibility(index: number, gameName: string, textureIndex: number): void {
        if (!this.instancedMesh || !this.geometry || !this.dataArrayTexture) {
            console.error(`🔥 Missing core components for "${gameName}" validation`)
            return
        }
        
        // Check if texture index is valid
        if (textureIndex >= this.maxTextures || textureIndex < 0) {
            console.error(`🔥 Invalid texture index ${textureIndex} for "${gameName}" (max: ${this.maxTextures})`)
            return
        }
        
        // Check if texture data exists at the calculated offset
        const sliceSize = this.textureSize * this.textureSize * 4
        const offset = textureIndex * sliceSize
        const arrayData = this.dataArrayTexture.image.data as Uint8Array
        
        if (offset + sliceSize > arrayData.length) {
            console.error(`🔥 Texture data out of bounds for "${gameName}" at index ${textureIndex}`)
            return
        }
        
        // Progressive sampling to check if texture has actual data
        // Start with safe center location, then expand search if needed
        // This avoids false positives from black borders while keeping checks fast
        
        const checkPixel = (x: number, y: number): boolean => {
            if (x < 0 || y < 0 || x >= this.textureSize || y >= this.textureSize) return false
            const pixelIndex = y * this.textureSize + x
            const i = offset + pixelIndex * 4
            if (i + 2 >= offset + sliceSize) return false // Bounds check
            return arrayData[i] !== 0 || arrayData[i + 1] !== 0 || arrayData[i + 2] !== 0
        }
        
        const center = Math.floor(this.textureSize / 2)
        const quarter = Math.floor(this.textureSize / 4)
        const threeQuarter = Math.floor(this.textureSize * 3 / 4)
        let hasNonZeroPixels = false
        
        // Level 1: Check center and immediate vicinity (5 pixels)
        if (
            checkPixel(center, center) ||
            checkPixel(center + 2, center) ||
            checkPixel(center - 2, center) ||
            checkPixel(center, center + 2) ||
            checkPixel(center, center - 2)
        ) {
            hasNonZeroPixels = true
        }
        // Level 2: Check 8 pixels in a wider cross and diagonal pattern (10-15px from center)
        else if (
            checkPixel(center + 10, center) ||
            checkPixel(center - 10, center) ||
            checkPixel(center, center + 10) ||
            checkPixel(center, center - 10) ||
            checkPixel(center + 10, center + 10) ||
            checkPixel(center - 10, center - 10) ||
            checkPixel(center + 10, center - 10) ||
            checkPixel(center - 10, center + 10)
        ) {
            hasNonZeroPixels = true
        }
        // Level 3: Check quarter points and midpoints (12 pixels covering more area)
        else if (
            checkPixel(quarter, quarter) ||
            checkPixel(quarter, center) ||
            checkPixel(quarter, threeQuarter) ||
            checkPixel(center, quarter) ||
            checkPixel(center, threeQuarter) ||
            checkPixel(threeQuarter, quarter) ||
            checkPixel(threeQuarter, center) ||
            checkPixel(threeQuarter, threeQuarter) ||
            checkPixel(quarter, 10) ||
            checkPixel(threeQuarter, 10) ||
            checkPixel(quarter, this.textureSize - 10) ||
            checkPixel(threeQuarter, this.textureSize - 10)
        ) {
            hasNonZeroPixels = true
        }
        // Level 4: Check areas near edges but not corners (8 pixels)
        else if (
            checkPixel(center, 15) ||
            checkPixel(center, this.textureSize - 15) ||
            checkPixel(15, center) ||
            checkPixel(this.textureSize - 15, center) ||
            checkPixel(quarter, 15) ||
            checkPixel(threeQuarter, 15) ||
            checkPixel(quarter, this.textureSize - 15) ||
            checkPixel(threeQuarter, this.textureSize - 15)
        ) {
            hasNonZeroPixels = true
        }
        
        if (!hasNonZeroPixels) {
            console.warn(`⚠️ Game "${gameName}" appears to have empty/black texture at index ${textureIndex}`)
            console.warn(`💡 This usually means cached artwork is corrupted. Consider clearing image cache or running cache validation.`)
        }
        
        // Check if instance matrix is valid (not at origin unless intended)
        const matrix = new THREE.Matrix4()
        this.instancedMesh.getMatrixAt(index, matrix)
        const position = new THREE.Vector3()
        matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3())
        
        if (position.length() < 0.01) {
            console.warn(`⚠️ Game "${gameName}" instance ${index} appears to be at origin - may not be visible`)
        }
    }

    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    public getStats() {
        const processorStats = this.textureProcessor.getStats()
        return {
            currentCount: this.currentCount,
            maxInstances: this.maxInstances,
            texturesUsed: processorStats.nextTextureIndex,
            maxTextures: this.maxTextures,
            isInitialized: this.isInitialized,
            textureProcessing: processorStats
        }
    }
    
    /**
     * Export texture array as viewable image for inspection
     */
    public debugExportTextureArray(): void {
        InstancedArtworkDebugger.exportTextureArray({
            dataArrayTexture: this.dataArrayTexture,
            textureSize: this.textureSize,
            maxTextures: this.maxTextures,
            maxInstances: this.maxInstances,
            currentCount: this.currentCount,
            isInitialized: this.isInitialized,
            getProcessorStats: () => this.textureProcessor.getStats()
        })
    }
    
    /**
     * Log detailed texture array state
     */
    public debugLogTextureArrayState(): void {
        InstancedArtworkDebugger.logTextureArrayState({
            dataArrayTexture: this.dataArrayTexture,
            textureSize: this.textureSize,
            maxTextures: this.maxTextures,
            maxInstances: this.maxInstances,
            currentCount: this.currentCount,
            isInitialized: this.isInitialized,
            getProcessorStats: () => this.textureProcessor.getStats()
        })
    }
    
    /**
     * Dispose of all resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing InstancedArtworkRenderer resources')
        
        // Remove from main scene
        if (this.instancedMesh) {
            const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
            if (scene) {
                scene.remove(this.instancedMesh)
                console.debug('🎨 Removed instanced artwork mesh from scene')
            }
        }
        
        // Dispose geometry
        this.geometry?.dispose()
        this.geometry = null
        
        // Dispose material
        this.material?.dispose()
        this.material = null
        
        // Dispose texture array
        this.dataArrayTexture?.dispose()
        this.dataArrayTexture = null
        
        // Dispose texture processor
        this.textureProcessor.dispose()
        
        // Reset state
        this.currentCount = 0
        this.isInitialized = false
        this.instancedMesh = null
        
        console.log('✅ InstancedArtworkRenderer disposed')
    }
}