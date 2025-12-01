/**
 * Texture Processor - Handles texture blob processing for instanced renderers
 * 
 * Converts image blobs to texture array data using Web Workers for offscreen
 * processing. Manages texture slot allocation and performance monitoring.
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
    /** Blob returned from worker for optional caching */
    blob?: Blob
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
    private hasLoggedMaxWarning: boolean = false
    
    private textureWorker: TextureWorker
    
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
        
        this.textureWorker = new TextureWorker()
        console.debug('🔧 TextureWorker initialized - texture processing offloaded from main thread')
    }
    
    private logPerformance(operation: string, duration: number): void {
        if (!this.enablePerfLogging) return
        
        console.debug(`⚡ ${operation}: ${duration.toFixed(2)}ms`)
        
        this.perfStats.textureProcessingTime += duration
        this.perfStats.totalTextures++
        this.perfStats.averageProcessingTime = this.perfStats.textureProcessingTime / this.perfStats.totalTextures
    }
    
    /**
     * Check if we can accept another texture, throwing if at capacity
     */
    private ensureCapacity(): void {
        if (this.nextTextureIndex >= this.maxTextures) {
            if (!this.hasLoggedMaxWarning) {
                console.warn(`⚠️ Maximum artwork textures reached (${this.maxTextures}). Additional games will use labels.`)
                this.hasLoggedMaxWarning = true
            }
            throw new Error('Maximum textures reached')
        }
    }
    
    /**
     * Reserve a texture slot and return the index
     * Returns existing index if game already has a texture
     */
    private reserveSlot(gameName: string): { index: number; isExisting: boolean } {
        const existingIndex = this.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return { index: existingIndex, isExisting: true }
        }
        return { index: this.nextTextureIndex++, isExisting: false }
    }
    
    /**
     * Copy processed image data to texture array at the reserved slot
     */
    private copyToTextureArray(
        imageData: Uint8ClampedArray | Uint8Array,
        textureIndex: number,
        dataArrayTexture: THREE.DataArrayTexture
    ): void {
        const sliceSize = this.textureSize * this.textureSize * 4
        const offset = textureIndex * sliceSize
        const arrayData = dataArrayTexture.image.data as Uint8Array
        arrayData.set(imageData, offset)
        // NOTE: needsUpdate deferred to batch update for efficiency
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
        this.ensureCapacity()
        
        const { index: reservedIndex, isExisting } = this.reserveSlot(gameName)
        if (isExisting) {
            return reservedIndex
        }
        
        // Validate blob
        if (blob.size === 0) {
            console.warn(`⚠️ Zero-byte blob for "${gameName}" - cached artwork may be corrupted`)
            throw new Error(`Zero-byte blob for "${gameName}"`)
        }
        
        if (blob.size < 100) {
            console.warn(`⚠️ Suspiciously small blob for "${gameName}": ${blob.size} bytes`)
        }
        
        const startTime = performance.now()
        
        // Process texture in web worker
        const imageData = await this.textureWorker.processTexture(blob, this.textureSize, reservedIndex)
        
        this.copyToTextureArray(imageData, reservedIndex, dataArrayTexture)
        this.textureSlots.set(gameName, reservedIndex)
        
        this.logPerformance(`texture processing for "${gameName}"`, performance.now() - startTime)
        
        return reservedIndex
    }
    
    /**
     * Fetch image from URL and process entirely in web worker
     * This is the preferred path - keeps network + canvas operations off main thread
     * 
     * @param url - URL to fetch image from
     * @param gameName - Game name for mapping and logging
     * @param dataArrayTexture - Target texture array to write to
     * @param timeout - Network timeout in ms (default 10000)
     * @returns Texture index and optional blob for caching
     */
    public async fetchAndProcessTexture(
        url: string,
        gameName: string,
        dataArrayTexture: THREE.DataArrayTexture,
        timeout: number = 10000
    ): Promise<TextureProcessingResult> {
        this.ensureCapacity()
        
        const { index: reservedIndex, isExisting } = this.reserveSlot(gameName)
        if (isExisting) {
            return { textureIndex: reservedIndex, processingTime: 0 }
        }
        
        const startTime = performance.now()
        
        // Fetch and process texture entirely in web worker
        const result = await this.textureWorker.fetchAndProcess(
            url,
            this.textureSize,
            reservedIndex,
            gameName,
            timeout
        )
        
        this.copyToTextureArray(result.imageData, reservedIndex, dataArrayTexture)
        this.textureSlots.set(gameName, reservedIndex)
        
        const totalTime = performance.now() - startTime
        this.logPerformance(`fetch+process for "${gameName}"`, totalTime)
        
        return { 
            textureIndex: reservedIndex, 
            processingTime: totalTime,
            blob: result.blob
        }
    }
    
    public getStats(): TextureProcessorStats {
        return {
            texturesProcessed: this.perfStats.totalTextures,
            averageProcessingTime: this.perfStats.averageProcessingTime,
            totalProcessingTime: this.perfStats.textureProcessingTime,
            textureSlots: this.textureSlots.size,
            nextTextureIndex: this.nextTextureIndex
        }
    }
    
    public hasTexture(gameName: string): boolean {
        return this.textureSlots.has(gameName)
    }
    
    public getTextureIndex(gameName: string): number | undefined {
        return this.textureSlots.get(gameName)
    }
    
    public dispose(): void {
        console.debug('🧹 Disposing TextureProcessor')
        
        this.textureWorker.dispose()
        this.textureSlots.clear()
    }
}
