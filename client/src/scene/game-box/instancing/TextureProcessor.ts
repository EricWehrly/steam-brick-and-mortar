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
        
        const startTime = performance.now()
        
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
        this.logPerformance(`texture processing for "${gameName}"`, endTime - startTime)
        
        return reservedTextureIndex
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
        // Check if we've reached max textures
        if (this.nextTextureIndex >= this.maxTextures) {
            console.error(`🚫 Maximum textures reached (${this.maxTextures}), rejecting "${gameName}"`)
            throw new Error('Maximum textures reached')
        }
        
        // Check if we already have this texture
        const existingIndex = this.textureSlots.get(gameName)
        if (existingIndex !== undefined) {
            return { textureIndex: existingIndex, processingTime: 0 }
        }
        
        const startTime = performance.now()
        
        // Reserve texture index immediately to prevent race conditions
        const reservedTextureIndex = this.nextTextureIndex++
        
        // Fetch and process texture entirely in web worker
        const result = await this.textureWorker.fetchAndProcess(
            url,
            this.textureSize,
            reservedTextureIndex,
            gameName,
            timeout
        )
        
        // Calculate offset for this texture slot in the array
        const sliceSize = this.textureSize * this.textureSize * 4
        const offset = reservedTextureIndex * sliceSize
        
        // Copy data to texture array (fast - just array copy)
        const arrayData = dataArrayTexture.image.data as Uint8Array
        arrayData.set(result.imageData, offset)
        
        // Mark texture as needing update
        dataArrayTexture.needsUpdate = true
        
        // Store mapping with reserved index
        this.textureSlots.set(gameName, reservedTextureIndex)
        
        // Performance logging
        const endTime = performance.now()
        const totalTime = endTime - startTime
        this.logPerformance(`fetch+process for "${gameName}"`, totalTime)
        
        return { 
            textureIndex: reservedTextureIndex, 
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
