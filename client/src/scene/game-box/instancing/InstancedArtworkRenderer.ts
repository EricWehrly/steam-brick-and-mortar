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
import { TextureWorker } from './TextureWorker'
import { EventManager } from '../../../core/EventManager'
import { GameEventTypes } from '../../../types/InteractionEvents'

export interface InstancedArtworkConfig {
    maxInstances?: number
    textureSize?: number
    boxWidth?: number
    boxHeight?: number
    boxDepth?: number
    enablePerformanceLogging?: boolean
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
    
    // Performance optimization - reusable canvas and context
    private sharedCanvas: HTMLCanvasElement | null = null
    private sharedContext: CanvasRenderingContext2D | null = null
    
    // Web Worker for offscreen texture processing
    private textureWorker: TextureWorker | null = null
    private useWebWorker: boolean = false
    
    // Performance monitoring
    private readonly enablePerfLogging: boolean
    private perfStats = {
        textureProcessingTime: 0,
        totalTextures: 0,
        averageProcessingTime: 0
    }
    
    constructor(config: InstancedArtworkConfig = {}) {
        this.maxInstances = config.maxInstances || 1000
        this.textureSize = config.textureSize || 512
        this.enablePerfLogging = config.enablePerformanceLogging ?? false
        
        this.dimensions = {
            width: config.boxWidth || 0.3,
            height: config.boxHeight || 0.4,
            depth: config.boxDepth || 0.1
        }
        
        EventManager.getInstance().registerEventHandler(GameEventTypes.InstancedBatchComplete, this.updateGPU.bind(this))
        
        // Pre-create shared canvas for artwork processing
        this.initializeSharedCanvas()
        
        // Initialize texture worker if supported
        this.initializeTextureWorker()
        
        console.debug(`🎨 InstancedArtworkRenderer created (max: ${this.maxInstances} artwork instances)`)
    }
    
    /**
     * Initialize shared canvas for artwork processing (performance optimization)
     */
    private initializeSharedCanvas(): void {
        this.sharedCanvas = document.createElement('canvas')
        this.sharedCanvas.width = this.textureSize
        this.sharedCanvas.height = this.textureSize
        this.sharedContext = this.sharedCanvas.getContext('2d')
        
        if (!this.sharedContext) {
            console.warn('⚠️ Failed to create shared canvas context for artwork processing')
        } else {
            console.debug(`🎨 Shared canvas initialized (${this.textureSize}x${this.textureSize})`)
        }
    }
    
    /**
     * Initialize texture worker if OffscreenCanvas is supported
     */
    private initializeTextureWorker(): void {
        // Re-enable Web Worker with better error handling
        if (TextureWorker.isSupported()) {
            try {
                this.textureWorker = new TextureWorker()
                this.useWebWorker = true
                console.debug('🔧 TextureWorker enabled - texture processing will be offloaded from main thread')
            } catch (error) {
                console.warn('⚠️ Failed to initialize TextureWorker, falling back to main thread processing:', error)
                this.useWebWorker = false
                this.textureWorker = null
            }
        } else {
            console.debug('💡 OffscreenCanvas not supported, using main thread texture processing')
            this.useWebWorker = false
        }
    }
    
    /**
     * Performance logging helper
     */
    private logPerformance(operation: string, duration: number): void {
        if (!this.enablePerfLogging) return
        
        console.debug(`⚡ ${operation}: ${duration.toFixed(2)}ms`)
        
        // Update running averages for texture processing
        if (operation.includes('texture processing')) {
            this.perfStats.textureProcessingTime += duration
            this.perfStats.totalTextures++
            this.perfStats.averageProcessingTime = this.perfStats.textureProcessingTime / this.perfStats.totalTextures
        }
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
                console.error(`🚫 Maximum textures reached (${this.maxTextures}), rejecting "${gameName}"`)
                reject(new Error('Maximum textures reached'))
                return
            }
            
            // Check if we already have this texture
            const existingIndex = this.textureSlots.get(gameName)
            if (existingIndex !== undefined) {
                // Debug removed to reduce log noise
                resolve(existingIndex)
                return
            }
            
            // Critical validation checks
            if (blob.size === 0) {
                console.warn(`⚠️ Zero-byte blob for "${gameName}" - cached artwork may be corrupted`)
                reject(new Error(`Zero-byte blob for "${gameName}"`))
                return
            }
            
            if (blob.size < 100) {
                console.warn(`⚠️ Suspiciously small blob for "${gameName}": ${blob.size} bytes`)
            }
            
            // Use Web Worker if available, otherwise fall back to main thread
            if (this.useWebWorker && this.textureWorker) {
                this.processTextureWithWorker(blob, gameName, resolve, reject)
            } else {
                this.processTextureOnMainThread(blob, gameName, resolve, reject)
            }
        })
    }
    
    /**
     * Process texture using Web Worker (offscreen)
     */
    private async processTextureWithWorker(
        blob: Blob, 
        gameName: string, 
        resolve: (value: number) => void, 
        reject: (error: Error) => void
    ): Promise<void> {
        const startTime = performance.now()
        
        try {
            if (!this.textureWorker || !this.dataArrayTexture) {
                reject(new Error('TextureWorker or texture array not available'))
                return
            }
            
            // Reserve texture index immediately to prevent race conditions
            const reservedTextureIndex = this.nextTextureIndex++
            
            // Process texture in web worker
            const imageData = await this.textureWorker.processTexture(blob, this.textureSize, reservedTextureIndex)
            
            // Calculate offset for this texture slot in the array
            const sliceSize = this.textureSize * this.textureSize * 4
            const offset = reservedTextureIndex * sliceSize
            
            // Copy data to texture array (this happens on main thread but is fast)
            const arrayData = this.dataArrayTexture.image.data as Uint8Array
            arrayData.set(imageData, offset)
            
            // Mark texture as needing update
            this.dataArrayTexture.needsUpdate = true
            
            // Store mapping with reserved index
            this.textureSlots.set(gameName, reservedTextureIndex)
            
            
            // Performance logging
            const endTime = performance.now()
            this.logPerformance(`texture processing for "${gameName}" (Web Worker)`, endTime - startTime)
            
            resolve(reservedTextureIndex)
            
        } catch (error) {
            console.error(`Web Worker texture processing failed for "${gameName}":`, error)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    }
    
    /**
     * Process texture on main thread (fallback)
     */
    private processTextureOnMainThread(
        blob: Blob, 
        gameName: string, 
        resolve: (value: number) => void, 
        reject: (error: Error) => void
    ): void {
        const img = new Image()
        img.onload = () => {
            const startTime = performance.now()
            
            try {
                if (!this.sharedContext || !this.dataArrayTexture) {
                    reject(new Error('Shared context or texture array not available'))
                    return
                }
                
                this.sharedContext.clearRect(0, 0, this.textureSize, this.textureSize)
                
                // Validate image dimensions
                if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                    console.error(`🔥 Invalid image dimensions for "${gameName}": ${img.naturalWidth}x${img.naturalHeight}`)
                    reject(new Error(`Invalid image dimensions: ${img.naturalWidth}x${img.naturalHeight}`))
                    return
                }
                
                // Draw and scale image to texture size
                this.sharedContext.drawImage(img, 0, 0, this.textureSize, this.textureSize)
                
                // Extract image data
                const imageData = this.sharedContext.getImageData(0, 0, this.textureSize, this.textureSize)
                
                // Validate extracted data
                if (!imageData || imageData.data.length === 0) {
                    console.error(`Failed to extract image data for "${gameName}"`)
                    reject(new Error(`Failed to extract image data`))
                    return
                }
                
                // Reserve texture index immediately to prevent race conditions
                const reservedTextureIndex = this.nextTextureIndex++
                const sliceSize = this.textureSize * this.textureSize * 4
                const offset = reservedTextureIndex * sliceSize
                
                // Copy data to texture array
                const arrayData = this.dataArrayTexture.image.data as Uint8Array
                arrayData.set(imageData.data, offset)
                
                // Mark texture as needing update
                this.dataArrayTexture.needsUpdate = true
                
                // Store mapping with reserved index
                this.textureSlots.set(gameName, reservedTextureIndex)
                
                console.debug(`🎨 Added artwork for "${gameName}" at RESERVED texture index ${reservedTextureIndex} (Main Thread)`)
                
                // Performance logging
                const endTime = performance.now()
                this.logPerformance(`texture processing for "${gameName}" (Main Thread)`, endTime - startTime)
                
                resolve(reservedTextureIndex)
                
            } catch (error) {
                console.error(`Main thread texture processing failed for "${gameName}":`, error)
                reject(error instanceof Error ? error : new Error(String(error)))
            }
        }
        
        img.onerror = () => {
            console.error(`Image failed to load for "${gameName}"`)
            reject(new Error(`Failed to load image for "${gameName}"`))
        }
        img.src = URL.createObjectURL(blob)
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
            
            const blob = artworkBlobs?.[preferredType]
            
            if (!blob) {
                console.warn(`❌ [Renderer] No artwork blob found for type "${preferredType}" in game "${gameName}". Available types:`, artworkBlobs ? Object.keys(artworkBlobs) : 'none')
                console.warn(`🔍 [Renderer] Full textureOptions for "${gameName}":`, textureOptions)
                return false
            }
            
            console.debug(`📦 [Renderer] Found blob for "${gameName}": ${blob.size}b (${preferredType})`)
            
            // Add texture to array and get index
            console.debug(`🎨 [Renderer] Processing texture for "${gameName}"...`)
            const textureIndex = await this.addArtworkToTextureArray(blob, gameName)
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
            console.debug(`🔧 [Renderer] Set matrix for "${gameName}" at instance ${index}`)
            
            // Update texture index attribute
            const textureIndices = this.geometry.getAttribute('textureIndex') as THREE.InstancedBufferAttribute
            textureIndices.setX(index, textureIndex)
            console.debug(`🔧 [Renderer] Set textureIndex=${textureIndex} for "${gameName}" at instance ${index}`)
            
            // Track highest index used
            const previousCount = this.currentCount
            this.currentCount = Math.max(this.currentCount, index + 1)
            console.debug(`📊 [Renderer] Updated currentCount: ${previousCount} → ${this.currentCount} (${gameName})`)
            
            // Validate geometry visibility after update
            this.validateInstanceVisibility(index, gameName, textureIndex)
            
            if (position.y < 0.1) {
                console.warn(`⚠️ Game "${gameName}" has low Y position: ${position.y.toFixed(2)} - might be on floor`)
            }
            
            console.debug(`✅ [Renderer] Successfully set artwork instance for "${gameName}": index=${index}, textureIndex=${textureIndex}, currentCount=${this.currentCount}`)
            return true
            
        } catch (error) {
            console.error(`❌ [Renderer] Failed to set artwork instance for "${gameName}":`, error)
            return false
        }
    }
    
    /**
     * Apply all instance updates to GPU
     */
    public updateGPU(): void {
        if (!this.isInitialized || !this.instancedMesh || !this.geometry) {
            return
        }
        
        
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.count = this.currentCount
        
        const textureIndices = this.geometry.getAttribute('textureIndex')
        if (textureIndices) {
            textureIndices.needsUpdate = true
            console.debug(`🚀 [GPU Update] Texture indices updated: ${textureIndices.count} entries`)
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
     * Automatically add instanced mesh to main scene via DataManager
     */
    private addToMainScene(): void {
        if (!this.instancedMesh) {
            console.warn('⚠️ Cannot add to scene: instancedMesh not initialized')
            return
        }
        
        const scene = DataManager.getInstance().get<any>('core.mainScene')
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
        
        // Sample first few pixels to check if texture has actual data
        let hasNonZeroPixels = false
        for (let i = offset; i < offset + Math.min(64, sliceSize); i += 4) {
            if (arrayData[i] !== 0 || arrayData[i + 1] !== 0 || arrayData[i + 2] !== 0) {
                hasNonZeroPixels = true
                break
            }
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
     * 🎯 SHOTGUN DEBUG: Export texture array as viewable image for inspection
     */
    public debugExportTextureArray(): void {
        if (!this.dataArrayTexture) {
            console.error('🔍 Cannot export texture array - not initialized')
            return
        }
        
        console.log(`🔍 [DEBUG] Exporting texture array for inspection...`)
        console.log(`🔍 [DEBUG] Array info: ${this.textureSize}x${this.textureSize}x${this.nextTextureIndex} textures`)
        
        try {
            // Create a large canvas to show all textures in a grid
            const texturesPerRow = Math.ceil(Math.sqrt(this.nextTextureIndex))
            const canvasWidth = texturesPerRow * this.textureSize
            const canvasHeight = Math.ceil(this.nextTextureIndex / texturesPerRow) * this.textureSize
            
            const debugCanvas = document.createElement('canvas')
            debugCanvas.width = canvasWidth
            debugCanvas.height = canvasHeight
            const debugCtx = debugCanvas.getContext('2d')
            
            if (!debugCtx) {
                console.error('🔥 Failed to create debug canvas context')
                return
            }
            
            // Fill background with checkered pattern to show transparency
            const checkerSize = 8
            for (let x = 0; x < canvasWidth; x += checkerSize) {
                for (let y = 0; y < canvasHeight; y += checkerSize) {
                    const isEven = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0
                    debugCtx.fillStyle = isEven ? '#ddd' : '#bbb'
                    debugCtx.fillRect(x, y, checkerSize, checkerSize)
                }
            }
            
            const arrayData = this.dataArrayTexture.image.data as Uint8Array
            const sliceSize = this.textureSize * this.textureSize * 4
            
            // Draw each texture in the grid
            for (let i = 0; i < this.nextTextureIndex; i++) {
                const offset = i * sliceSize
                const imageData = new ImageData(
                    new Uint8ClampedArray(arrayData.slice(offset, offset + sliceSize)),
                    this.textureSize,
                    this.textureSize
                )
                
                const x = (i % texturesPerRow) * this.textureSize
                const y = Math.floor(i / texturesPerRow) * this.textureSize
                
                debugCtx.putImageData(imageData, x, y)
                
                // Add texture index label
                debugCtx.fillStyle = 'red'
                debugCtx.font = '16px monospace'
                debugCtx.fillText(`${i}`, x + 5, y + 20)
            }
            
            // Convert to blob and trigger download
            debugCanvas.toBlob((blob) => {
                if (!blob) {
                    console.error('🔥 Failed to create blob from debug canvas')
                    return
                }
                
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `texture-array-debug-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.png`
                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)
                URL.revokeObjectURL(url)
                
                console.log(`✅ [DEBUG] Texture array exported: ${this.nextTextureIndex} textures, ${canvasWidth}x${canvasHeight}px`)
            }, 'image/png')
            
        } catch (error) {
            console.error('🔥 [DEBUG] Failed to export texture array:', error)
        }
    }
    
    /**
     * 🎯 SHOTGUN DEBUG: Log detailed texture array state
     */
    public debugLogTextureArrayState(): void {
        console.log(`🔍 [DEBUG] ===== TEXTURE ARRAY STATE =====`)
        console.log(`🔍 [DEBUG] Initialized: ${this.isInitialized}`)
        console.log(`🔍 [DEBUG] Texture Array: ${this.dataArrayTexture ? 'EXISTS' : 'NULL'}`)
        console.log(`🔍 [DEBUG] Size: ${this.textureSize}x${this.textureSize}`)
        console.log(`🔍 [DEBUG] Used Slots: ${this.nextTextureIndex}/${this.maxTextures}`)
        console.log(`🔍 [DEBUG] Active Instances: ${this.currentCount}/${this.maxInstances}`)
        console.log(`🔍 [DEBUG] Texture Mappings: ${this.textureSlots.size}`)
        
        console.log(`🔍 [DEBUG] Texture Slot Mappings:`)
        for (const [gameName, textureIndex] of this.textureSlots) {
            console.log(`🔍 [DEBUG]   "${gameName}" → ${textureIndex}`)
        }
        
        if (this.dataArrayTexture) {
            const arrayData = this.dataArrayTexture.image.data as Uint8Array
            console.log(`🔍 [DEBUG] Array Data Length: ${arrayData.length} bytes`)
            console.log(`🔍 [DEBUG] Expected Length: ${this.textureSize * this.textureSize * this.maxTextures * 4} bytes`)
        }
        
        console.log(`🔍 [DEBUG] ===============================`)
    }
    
    /**
     * Dispose of all resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing InstancedArtworkRenderer resources')
        
        // Remove from main scene
        if (this.instancedMesh) {
            const scene = DataManager.getInstance().get<any>('core.mainScene')
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
        
        // Clean up shared canvas
        this.sharedCanvas = null
        this.sharedContext = null
        
        // Clean up texture worker
        if (this.textureWorker) {
            this.textureWorker.dispose()
            this.textureWorker = null
        }
        
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