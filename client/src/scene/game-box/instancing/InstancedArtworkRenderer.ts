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

export interface InstancedArtworkConfig {
    maxInstances?: number
    textureSize?: number
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
}

export class InstancedArtworkRenderer {
    private instancedMesh: THREE.InstancedMesh | null = null
    private geometry: THREE.BoxGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // Texture management
    private dataArrayTexture: THREE.DataArrayTexture | null = null
    private textureSlots: Map<string, number> = new Map() // gameName -> texture array index
    private nextTextureIndex: number = 0
    
    // Configuration
    private readonly maxInstances: number
    private readonly textureSize: number
    private readonly maxTextures: number = 256 // Reasonable limit for texture array
    
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
        
        this.dimensions = {
            width: config.boxWidth || 0.3,
            height: config.boxHeight || 0.4,
            depth: config.boxDepth || 0.1
        }
        
        console.debug(`🎨 InstancedArtworkRenderer created (max: ${this.maxInstances} artwork instances)`)
    }
    
    /**
     * Initialize the renderer - creates geometry, material, and empty texture array
     */
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
            this.instancedMesh.name = 'gpu-instanced-artwork-boxes'
            
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
            
        } catch (error) {
            console.error('❌ Failed to initialize InstancedArtworkRenderer:', error)
            throw error
        }
    }
    
    /**
     * Create empty texture array for dynamic population
     */
    private createEmptyTextureArray(): void {
        const size = this.textureSize
        const depth = this.maxTextures
        
        // Create empty RGBA data
        const data = new Uint8Array(size * size * depth * 4)
        
        // Fill with black/transparent initially
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0     // R
            data[i + 1] = 0 // G
            data[i + 2] = 0 // B
            data[i + 3] = 0 // A (transparent)
        }
        
        this.dataArrayTexture = new THREE.DataArrayTexture(data, size, size, depth)
        this.dataArrayTexture.format = THREE.RGBAFormat
        this.dataArrayTexture.type = THREE.UnsignedByteType
        this.dataArrayTexture.minFilter = THREE.LinearFilter
        this.dataArrayTexture.magFilter = THREE.LinearFilter
        this.dataArrayTexture.wrapS = THREE.ClampToEdgeWrapping
        this.dataArrayTexture.wrapT = THREE.ClampToEdgeWrapping
        this.dataArrayTexture.needsUpdate = true
    }
    
    /**
     * Create shader material for artwork rendering
     */
    private createArtworkMaterial(): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            uniforms: {
                textureArray: { value: this.dataArrayTexture }
            },
            vertexShader: `
                attribute float textureIndex;
                varying vec2 vUv;
                varying float vTextureIndex;
                
                void main() {
                    // Fix texture orientation by flipping V coordinate
                    vUv = vec2(uv.x, 1.0 - uv.y);
                    vTextureIndex = textureIndex;
                    
                    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2DArray textureArray;
                varying vec2 vUv;
                varying float vTextureIndex;
                
                void main() {
                    vec3 texCoord = vec3(vUv, vTextureIndex);
                    vec4 texColor = texture(textureArray, texCoord);
                    
                    // Handle transparency
                    if (texColor.a < 0.1) discard;
                    
                    gl_FragColor = texColor;
                }
            `,
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
    
    /**
     * Add artwork texture to the texture array and return its index
     */
    private addArtworkToTextureArray(blob: Blob, gameName: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (this.nextTextureIndex >= this.maxTextures) {
                reject(new Error('Maximum textures reached'))
                return
            }
            
            // Check if we already have this texture
            const existingIndex = this.textureSlots.get(gameName)
            if (existingIndex !== undefined) {
                resolve(existingIndex)
                return
            }
            
            const img = new Image()
            img.onload = () => {
                try {
                    // Create canvas to extract image data
                    const canvas = document.createElement('canvas')
                    canvas.width = this.textureSize
                    canvas.height = this.textureSize
                    const ctx = canvas.getContext('2d')
                    
                    if (!ctx || !this.dataArrayTexture) {
                        reject(new Error('Canvas context or texture array not available'))
                        return
                    }
                    
                    // Draw and scale image to texture size
                    ctx.drawImage(img, 0, 0, this.textureSize, this.textureSize)
                    
                    // Extract image data
                    const imageData = ctx.getImageData(0, 0, this.textureSize, this.textureSize)
                    
                    // Calculate offset for this texture slot in the array
                    const textureIndex = this.nextTextureIndex
                    const sliceSize = this.textureSize * this.textureSize * 4
                    const offset = textureIndex * sliceSize
                    
                    // Copy data to texture array
                    const arrayData = this.dataArrayTexture.image.data as Uint8Array
                    arrayData.set(imageData.data, offset)
                    
                    // Mark texture as needing update
                    this.dataArrayTexture.needsUpdate = true
                    
                    // Store mapping
                    this.textureSlots.set(gameName, textureIndex)
                    this.nextTextureIndex++
                    
                    console.debug(`🎨 Added artwork for "${gameName}" at texture index ${textureIndex}`)
                    resolve(textureIndex)
                    
                } catch (error) {
                    reject(error)
                }
            }
            
            img.onerror = () => reject(new Error('Failed to load image'))
            img.src = URL.createObjectURL(blob)
        })
    }
    
    /**
     * Set position and artwork for a specific instance
     */
    public async setArtworkInstance(
        index: number,
        position: THREE.Vector3,
        gameName: string,
        textureOptions: GameBoxTextureOptions
    ): Promise<boolean> {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) {
            console.warn('InstancedArtworkRenderer not initialized')
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
            const blob = artworkBlobs[preferredType]
            
            if (!blob) {
                console.warn(`No artwork blob found for type "${preferredType}" in game "${gameName}"`)
                return false
            }
            
            // Add texture to array and get index
            const textureIndex = await this.addArtworkToTextureArray(blob, gameName)
            
            // Update matrix for this instance
            const matrix = new THREE.Matrix4()
            matrix.compose(position, InstancedArtworkRenderer.DEFAULT_ROTATION, new THREE.Vector3(1, 1, 1))
            this.instancedMesh.setMatrixAt(index, matrix)
            
            // Update texture index attribute
            const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(index, textureIndex)
            
            // Track highest index used
            this.currentCount = Math.max(this.currentCount, index + 1)
            
            console.debug(`🎨 Set artwork instance ${index} for "${gameName}" at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`)
            return true
            
        } catch (error) {
            console.error(`❌ Failed to set artwork instance for "${gameName}":`, error)
            return false
        }
    }
    
    /**
     * Apply all instance updates to GPU
     */
    public updateGPU(): void {
        if (!this.instancedMesh || !this.geometry) {
            console.warn('❌ updateGPU called but instancedMesh or geometry is null')
            return
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
        }
        
        console.debug(`🔄 GPU updated: ${this.currentCount} active artwork instances`)
    }
    
    /**
     * Reset all instances
     */
    public reset(): void {
        this.currentCount = 0
        if (this.instancedMesh) {
            this.instancedMesh.count = 0
        }
        console.debug('🔄 Artwork instances reset')
    }
    
    /**
     * Get the InstancedMesh for adding to scene
     */
    public getInstancedMesh(): THREE.InstancedMesh | null {
        return this.instancedMesh
    }
    
    /**
     * Check if renderer is ready for use
     */
    public isReady(): boolean {
        return this.isInitialized && this.instancedMesh !== null
    }
    
    /**
     * Get current stats
     */
    public getStats() {
        return {
            currentCount: this.currentCount,
            maxInstances: this.maxInstances,
            texturesUsed: this.nextTextureIndex,
            maxTextures: this.maxTextures,
            isInitialized: this.isInitialized
        }
    }
    
    /**
     * Dispose of all resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing InstancedArtworkRenderer resources')
        
        // Dispose geometry
        this.geometry?.dispose()
        this.geometry = null
        
        // Dispose material
        this.material?.dispose()
        this.material = null
        
        // Dispose texture array
        this.dataArrayTexture?.dispose()
        this.dataArrayTexture = null
        
        // Clear mappings
        this.textureSlots.clear()
        
        // Reset state
        this.currentCount = 0
        this.nextTextureIndex = 0
        this.isInitialized = false
        this.instancedMesh = null
        
        console.log('✅ InstancedArtworkRenderer disposed')
    }
}