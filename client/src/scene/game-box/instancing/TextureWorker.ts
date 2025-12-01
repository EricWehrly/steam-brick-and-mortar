/**
 * Web Worker manager for texture processing using OffscreenCanvas
 * Offloads expensive getImageData operations from the main thread
 * 
 * Uses Vite's worker import syntax to load the worker from a separate file.
 */

import type { 
    TextureProcessingMessage, 
    TextureProcessingResult, 
    TextureProcessingError 
} from './texture-processing.worker'

// Vite worker import - creates a new worker from the file
import TextureProcessingWorker from './texture-processing.worker?worker'

export class TextureWorker {
    private worker: Worker
    private pendingMessages = new Map<string, {
        resolve: (data: Uint8ClampedArray) => void
        reject: (error: Error) => void
    }>()
    
    constructor() {
        // Create worker using Vite's worker constructor
        this.worker = new TextureProcessingWorker()
        
        this.worker.onmessage = (event: MessageEvent) => {
            this.handleWorkerMessage(event.data)
        }
        
        this.worker.onerror = (error) => {
            console.error('🔥 TextureWorker error:', {
                message: error.message,
                filename: error.filename,
                lineno: error.lineno,
                colno: error.colno,
                error: error.error,
                fullError: error
            })
        }
        
        this.worker.onmessageerror = (error) => {
            console.error('🔥 TextureWorker message error:', error)
        }
        
        console.debug('🔧 TextureWorker initialized with OffscreenCanvas support')
    }
    
    /**
     * Process texture in web worker
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
    
    private handleWorkerMessage(data: TextureProcessingResult | TextureProcessingError): void {
        const { messageId } = data
        const pending = this.pendingMessages.get(messageId)
        
        if (!pending) {
            console.warn('⚠️ Received worker message for unknown messageId:', messageId)
            return
        }
        
        this.pendingMessages.delete(messageId)
        
        if (data.type === 'TEXTURE_PROCESSED') {
            pending.resolve(data.imageData)
        } else if (data.type === 'TEXTURE_ERROR') {
            pending.reject(new Error(data.error))
        }
    }
    
    /**
     * Check if OffscreenCanvas is supported
     */
    public static isSupported(): boolean {
        const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
        const hasCreateImageBitmap = 'createImageBitmap' in window
        const hasWorker = typeof Worker !== 'undefined'
        
        console.debug('🔍 Web Worker support check:', {
            hasOffscreenCanvas,
            hasCreateImageBitmap,
            hasWorker,
            supported: hasOffscreenCanvas && hasCreateImageBitmap && hasWorker
        })
        
        return hasOffscreenCanvas && hasCreateImageBitmap && hasWorker
    }
    
    /**
     * Clean up worker resources
     */
    public dispose(): void {
        // Reject any pending messages
        for (const [, pending] of this.pendingMessages) {
            pending.reject(new Error('Worker disposed'))
        }
        this.pendingMessages.clear()
        
        this.worker.terminate()
        console.debug('🔧 TextureWorker disposed')
    }
}