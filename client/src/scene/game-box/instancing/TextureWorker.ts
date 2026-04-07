/**
 * Web Worker manager for texture processing using OffscreenCanvas
 * Offloads expensive image operations from the main thread:
 * - Network fetch of image URLs
 * - Blob to ImageBitmap conversion
 * - getImageData extraction
 * 
 * Uses Vite's worker import syntax to load the worker from a separate file.
 */

import type { 
    TextureProcessingMessage,
    TextureFetchMessage,
    TextureProcessingResult, 
    TextureProcessingError 
} from './texture-processing.worker'
import { Logger } from '../../../utils/Logger'

// Vite worker import - creates a new worker from the file
import TextureProcessingWorker from './texture-processing.worker?worker'
import { makeWorkerErrorHandler } from '../../../utils/WorkerErrorUtils'

export interface FetchAndProcessResult {
    imageData: Uint8ClampedArray
    blob?: Blob
    processingTime: number
    /** Actual width of returned image data */
    width: number
    /** Actual height of returned image data */
    height: number
}

export interface FetchAndProcessOptions {
    /** For square textures (legacy) */
    textureSize?: number
    /** For non-square textures */
    textureWidth?: number
    textureHeight?: number
    /** If true, use native image dimensions (skip resize entirely) */
    useNativeSize?: boolean
    timeout?: number
}

export class TextureWorker {
    public static logger = Logger.createLogFunctions(TextureWorker.name)
    private worker: Worker
    private pendingMessages = new Map<string, {
        resolve: (data: unknown) => void
        reject: (error: Error) => void
        includeBlob?: boolean
    }>()
    
    constructor() {
        // Create worker using Vite's worker constructor
        this.worker = new TextureProcessingWorker()
        
        this.worker.onmessage = (event: MessageEvent) => {
            this.handleWorkerMessage(event.data)
        }
        
        this.worker.onerror = makeWorkerErrorHandler('TextureWorker', this.pendingMessages as never, TextureWorker.logger)

        this.worker.onmessageerror = (error) => {
            TextureWorker.logger.error('TextureWorker message deserialization error:', error)
        }

        TextureWorker.logger.lifecycle('Initialized')
    }
    
    /**
     * Process texture from blob in web worker (legacy mode)
     */
    public async processTexture(blob: Blob, textureSize: number, textureIndex: number): Promise<Uint8ClampedArray> {
        return new Promise((resolve, reject) => {
            const messageId = `texture_${textureIndex}_${Date.now()}_${Math.random()}`
            
            this.pendingMessages.set(messageId, { resolve, reject })
            
            const message: TextureProcessingMessage = {
                type: 'PROCESS_TEXTURE',
                blob,
                textureSize,
                textureIndex,
                messageId
            }
            
            this.worker.postMessage(message)
        })
    }
    
    /**
     * Fetch image from URL and process in web worker (legacy square textures)
     * Returns both the processed image data and optionally the blob for caching
     */
    public async fetchAndProcess(
        url: string, 
        textureSize: number, 
        textureIndex: number,
        gameName: string,
        timeout: number = 10000
    ): Promise<FetchAndProcessResult> {
        return this.fetchAndProcessWithOptions(url, textureIndex, gameName, {
            textureSize,
            timeout
        })
    }
    
    /**
     * Fetch image from URL and process in web worker with flexible options
     * Supports native resolution (no resize), width/height, or legacy square textures
     */
    public async fetchAndProcessWithOptions(
        url: string,
        textureIndex: number,
        gameName: string,
        options: FetchAndProcessOptions = {}
    ): Promise<FetchAndProcessResult> {
        return new Promise((resolve, reject) => {
            const messageId = `fetch_${textureIndex}_${Date.now()}_${Math.random()}`
            
            this.pendingMessages.set(messageId, { 
                resolve, 
                reject,
                includeBlob: true
            })
            
            const message: TextureFetchMessage = {
                type: 'FETCH_AND_PROCESS',
                url,
                textureSize: options.textureSize,
                textureWidth: options.textureWidth,
                textureHeight: options.textureHeight,
                useNativeSize: options.useNativeSize,
                textureIndex,
                messageId,
                gameName,
                timeout: options.timeout ?? 10000
            }
            
            this.worker.postMessage(message)
        })
    }
    
    private handleWorkerMessage(data: TextureProcessingResult | TextureProcessingError): void {
        const { messageId } = data
        const pending = this.pendingMessages.get(messageId)
        
        if (!pending) {
            TextureWorker.logger.warn('⚠️ Received worker message for unknown messageId:', messageId)
            return
        }
        
        this.pendingMessages.delete(messageId)
        
        if (data.type === 'TEXTURE_PROCESSED') {
            if (pending.includeBlob) {
                // Return full result with blob for caching
                pending.resolve({
                    imageData: data.imageData,
                    blob: data.blob,
                    processingTime: data.processingTime,
                    width: data.width,
                    height: data.height
                })
            } else {
                // Legacy mode - just return imageData
                pending.resolve(data.imageData)
            }
        } else if (data.type === 'TEXTURE_ERROR') {
            pending.reject(new Error(data.error))
        }
    }
    
    public dispose(): void {
        // Reject any pending messages
        for (const [, pending] of this.pendingMessages) {
            pending.reject(new Error('Worker disposed'))
        }
        this.pendingMessages.clear()
        
        this.worker.terminate()
        TextureWorker.logger.lifecycle('Disposed')
    }
}