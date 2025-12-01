/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Web Worker for texture processing using OffscreenCanvas
 * 
 * Offloads expensive getImageData operations from the main thread.
 * This file is loaded as a dedicated worker via Vite's ?worker import.
 * 
 * Current responsibilities:
 * - Receive image blob from main thread
 * - Create ImageBitmap and draw to OffscreenCanvas
 * - Extract pixel data (getImageData - the expensive operation)
 * - Transfer pixel data back to main thread
 * 
 * Future expansion (TODO):
 * - Move image download (fetch) into worker
 * - Handle image caching within worker
 * - Batch multiple texture operations
 */

// Worker global scope - these are available in web worker context
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

// Empty export to make this a module (required for isolatedModules)
export {}

export interface TextureProcessingMessage {
    type: 'PROCESS_TEXTURE'
    blob: Blob
    textureSize: number
    textureIndex: number
    messageId: string
}

export interface TextureProcessingResult {
    type: 'TEXTURE_PROCESSED'
    imageData: Uint8ClampedArray
    textureIndex: number
    messageId: string
    processingTime: number
}

export interface TextureProcessingError {
    type: 'TEXTURE_ERROR'
    error: string
    messageId: string
}

export type WorkerMessage = TextureProcessingMessage
export type WorkerResponse = TextureProcessingResult | TextureProcessingError

// Worker state
let offscreenCanvas: OffscreenCanvas | null = null
let offscreenContext: OffscreenCanvasRenderingContext2D | null = null

// Global error handler
ctx.onerror = (event: ErrorEvent): boolean => {
    console.error('Worker script error:', event)
    ctx.postMessage({
        type: 'TEXTURE_ERROR',
        error: 'Worker script error: ' + event.message,
        messageId: 'global-error'
    } satisfies TextureProcessingError)
    return true
}

ctx.onmessage = async (event: MessageEvent<TextureProcessingMessage>): Promise<void> => {
    try {
        const { type, blob, textureSize, textureIndex, messageId } = event.data
        
        if (type !== 'PROCESS_TEXTURE') {
            console.log('Worker ignoring message type:', type)
            return
        }
        
        console.debug('Worker processing texture:', { textureSize, textureIndex, blobSize: blob.size })
        const startTime = performance.now()
        
        try {
            // Initialize offscreen canvas if needed (reuse for same size)
            if (!offscreenCanvas || offscreenCanvas.width !== textureSize) {
                offscreenCanvas = new OffscreenCanvas(textureSize, textureSize)
                offscreenContext = offscreenCanvas.getContext('2d')
                
                if (!offscreenContext) {
                    throw new Error('Failed to create OffscreenCanvas context')
                }
            }
            
            // Create image bitmap from blob
            const imageBitmap = await createImageBitmap(blob)
            
            // Clear and draw
            offscreenContext!.clearRect(0, 0, textureSize, textureSize)
            offscreenContext!.drawImage(imageBitmap, 0, 0, textureSize, textureSize)
            
            // Extract image data (this is the expensive operation we're offloading)
            const imageData = offscreenContext!.getImageData(0, 0, textureSize, textureSize)
            
            // Clean up
            imageBitmap.close()
            
            const processingTime = performance.now() - startTime
            
            // Send back the processed data
            const result: TextureProcessingResult = {
                type: 'TEXTURE_PROCESSED',
                imageData: imageData.data,
                textureIndex: textureIndex,
                messageId: messageId,
                processingTime: processingTime
            }
            
            // Transfer the ArrayBuffer to avoid copying
            ctx.postMessage(result, [imageData.data.buffer])
            
        } catch (error) {
            const errorResult: TextureProcessingError = {
                type: 'TEXTURE_ERROR',
                error: error instanceof Error ? error.message : String(error),
                messageId: messageId
            }
            
            ctx.postMessage(errorResult)
        }
    } catch (outerError) {
        console.error('Worker message handler error:', outerError)
        const errorResult: TextureProcessingError = {
            type: 'TEXTURE_ERROR',
            error: 'Worker message handler error: ' + (outerError instanceof Error ? outerError.message : String(outerError)),
            messageId: event.data?.messageId ?? 'unknown'
        }
        ctx.postMessage(errorResult)
    }
}
