/**
 * Texture Processor - Handles texture blob processing for instanced renderers
 * 
 * Converts image blobs to texture array data using either Web Workers (offscreen)
 * or main thread processing as fallback. Manages texture slot allocation and
 * performance monitoring.
 */

import * as THREE from 'three'
import { TextureWorker } from './TextureWorker'

export interface TextureProcessorConfig {
    textureSize: number
    maxTextures: number
    enablePerformanceLogging?: boolean
}

export interface TextureProcessingResult {
    textureIndex: number
    processingTime: number
}

export interface TextureProcessorStats {
    texturesProcessed: number
    averageProcessingTime: number
    totalProcessingTime: number
    textureSlots: number
    nextTextureIndex: number
}

export class TextureProcessor {
    private readonly textureSize: number
    private readonly maxTextures: number
    private readonly enablePerfLogging: boolean
    
    private textureSlots: Map<string, number> = new Map()
    private nextTextureIndex: number = 0
    
    // Shared canvas for main thread processing
    private sharedCanvas: HTMLCanvasElement | null = null
    private sharedContext: CanvasRenderingContext2D | null = null
    
    // Web Worker for offscreen processing
    private textureWorker: TextureWorker | null = null
    private useWebWorker: boolean = false
    
    // Performance stats
    private perfStats = {
        textureProcessingTime: 0,
        totalTextures: 0,
        averageProcessingTime: 0
    }
    
    constructor(config: TextureProcessorConfig) {
        this.textureSize = config.textureSize
        this.maxTextures = config.maxTextures
        this.enablePerfLogging = config.enablePerformanceLogging ?? false
        
        this.initializeSharedCanvas()
        this.initializeTextureWorker()
    }
    
    private initializeSharedCanvas(): void {
        this.sharedCanvas = document.createElement('canvas')
        this.sharedCanvas.width = this.textureSize
        this.sharedCanvas.height = this.textureSize
        this.sharedContext = this.sharedCanvas.getContext('2d')
        
        if (!this.sharedContext) {
            console.warn('⚠️ Failed to create shared canvas context for texture processing')
        } else {
            console.debug(`🎨 Shared canvas initialized (${this.textureSize}x${this.textureSize})`)
        }
    }
    
    private initializeTextureWorker(): void {
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
    
    private logPerformance(operation: string, duration: number): void {
        if (!this.enablePerfLogging) return
        
        console.debug(`⚡ ${operation}: ${duration.toFixed(2)}ms`)
        
        this.perfStats.textureProcessingTime += duration
        this.perfStats.totalTextures++
        this.perfStats.averageProcessingTime = this.perfStats.textureProcessingTime / this.perfStats.totalTextures
    }
    
    /**
     * Process a texture blob and add it to the texture array
     * Returns the texture index in the array
     */
    public async processTexture(
        blob: Blob,
        gameName: string,
        dataArrayTexture: THREE.DataArrayTexture
    ): Promise<number> {
        // Check if we've reached max textures
        if (this.nextTextureIndex >= this.maxTextures) {
            console.error(`🚫 Maximum textures reached (${this.maxTextures}), rejecting "${gameName}"`)
            throw new Error('Maximum textures reached')
        }
        
        // Check if we already have this texture
        const existingIndex = this.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return existingIndex
        }
        
        // Validate blob
        if (blob.size === 0) {
            console.warn(`⚠️ Zero-byte blob for "${gameName}" - cached artwork may be corrupted`)
            throw new Error(`Zero-byte blob for "${gameName}"`)
        }
        
        if (blob.size < 100) {
            console.warn(`⚠️ Suspiciously small blob for "${gameName}": ${blob.size} bytes`)
        }
        
        // Process using worker or main thread
        if (this.useWebWorker && this.textureWorker) {
            return this.processWithWorker(blob, gameName, dataArrayTexture)
        } else {
            return this.processOnMainThread(blob, gameName, dataArrayTexture)
        }
    }
    
    private async processWithWorker(
        blob: Blob,
        gameName: string,
        dataArrayTexture: THREE.DataArrayTexture
    ): Promise<number> {
        const startTime = performance.now()
        
        if (!this.textureWorker) {
            throw new Error('TextureWorker not available')
        }
        
        // Reserve texture index immediately to prevent race conditions
        const reservedTextureIndex = this.nextTextureIndex++
        
        // Process texture in web worker
        const imageData = await this.textureWorker.processTexture(blob, this.textureSize, reservedTextureIndex)
        
        // Calculate offset for this texture slot in the array
        const sliceSize = this.textureSize * this.textureSize * 4
        const offset = reservedTextureIndex * sliceSize
        
        // Copy data to texture array (happens on main thread but is fast)
        const arrayData = dataArrayTexture.image.data as Uint8Array
        arrayData.set(imageData, offset)
        
        // Mark texture as needing update
        dataArrayTexture.needsUpdate = true
        
        // Store mapping with reserved index
        this.textureSlots.set(gameName, reservedTextureIndex)
        
        // Performance logging
        const endTime = performance.now()
        this.logPerformance(`texture processing for "${gameName}" (Web Worker)`, endTime - startTime)
        
        return reservedTextureIndex
    }
    
    private processOnMainThread(
        blob: Blob,
        gameName: string,
        dataArrayTexture: THREE.DataArrayTexture
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            const img = new Image()
            
            img.onload = () => {
                const startTime = performance.now()
                
                try {
                    if (!this.sharedContext) {
                        reject(new Error('Shared context not available'))
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
                    const arrayData = dataArrayTexture.image.data as Uint8Array
                    arrayData.set(imageData.data, offset)
                    
                    // Mark texture as needing update
                    dataArrayTexture.needsUpdate = true
                    
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
        })
    }
    
    /**
     * Get performance statistics
     */
    public getStats(): TextureProcessorStats {
        return {
            texturesProcessed: this.perfStats.totalTextures,
            averageProcessingTime: this.perfStats.averageProcessingTime,
            totalProcessingTime: this.perfStats.textureProcessingTime,
            textureSlots: this.textureSlots.size,
            nextTextureIndex: this.nextTextureIndex
        }
    }
    
    /**
     * Check if a texture has already been processed
     */
    public hasTexture(gameName: string): boolean {
        return this.textureSlots.has(gameName)
    }
    
    /**
     * Get texture index for a game name
     */
    public getTextureIndex(gameName: string): number | undefined {
        return this.textureSlots.get(gameName)
    }
    
    /**
     * Clean up resources
     */
    public dispose(): void {
        console.debug('🧹 Disposing TextureProcessor')
        
        this.sharedCanvas = null
        this.sharedContext = null
        
        if (this.textureWorker) {
            this.textureWorker.dispose()
            this.textureWorker = null
        }
        
        this.textureSlots.clear()
    }
}
