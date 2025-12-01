/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Web Worker for texture processing using OffscreenCanvas
 * 
 * Offloads expensive image operations from the main thread:
 * - Network fetch of image URLs
 * - Blob to ImageBitmap conversion
 * - Canvas rendering and scaling
 * - getImageData extraction (the expensive operation)
 * 
 * This file is loaded as a dedicated worker via Vite's ?worker import.
 */

// Worker global scope - these are available in web worker context
const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

// Empty export to make this a module (required for isolatedModules)
export {}

// === Message Types ===

/** Process texture from a Blob (legacy mode) */
export interface TextureProcessingMessage {
    type: 'PROCESS_TEXTURE'
    blob: Blob
    textureSize: number
    textureIndex: number
    messageId: string
}

/** Fetch and process texture from a URL (new mode) */
export interface TextureFetchMessage {
    type: 'FETCH_AND_PROCESS'
    url: string
    textureSize: number
    textureIndex: number
    messageId: string
    gameName: string
    timeout?: number
}

export interface TextureProcessingResult {
    type: 'TEXTURE_PROCESSED'
    imageData: Uint8ClampedArray
    textureIndex: number
    messageId: string
    processingTime: number
    gameName?: string
    /** Original blob for caching on main thread */
    blob?: Blob
}

export interface TextureProcessingError {
    type: 'TEXTURE_ERROR'
    error: string
    messageId: string
    gameName?: string
}

export type WorkerMessage = TextureProcessingMessage | TextureFetchMessage
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

/**
 * Initialize or reuse offscreen canvas for the given texture size
 */
function ensureCanvas(textureSize: number): void {
    if (!offscreenCanvas || offscreenCanvas.width !== textureSize) {
        offscreenCanvas = new OffscreenCanvas(textureSize, textureSize)
        offscreenContext = offscreenCanvas.getContext('2d')
        
        if (!offscreenContext) {
            throw new Error('Failed to create OffscreenCanvas context')
        }
    }
}

/**
 * Process a blob into texture pixel data
 */
async function processBlob(
    blob: Blob, 
    textureSize: number
): Promise<Uint8ClampedArray> {
    ensureCanvas(textureSize)
    
    // Create image bitmap from blob
    const imageBitmap = await createImageBitmap(blob)
    
    // Clear and draw scaled to texture size
    offscreenContext!.clearRect(0, 0, textureSize, textureSize)
    offscreenContext!.drawImage(imageBitmap, 0, 0, textureSize, textureSize)
    
    // Extract image data (the expensive operation we're offloading)
    const imageData = offscreenContext!.getImageData(0, 0, textureSize, textureSize)
    
    // Clean up bitmap
    imageBitmap.close()
    
    return imageData.data
}

/**
 * Fetch image from URL with timeout
 */
async function fetchImage(url: string, timeout: number = 10000): Promise<Blob> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            mode: 'cors'
        })
        
        clearTimeout(timeoutId)
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const blob = await response.blob()
        
        if (!blob.type.startsWith('image/')) {
            throw new Error(`Invalid content type: ${blob.type}`)
        }
        
        return blob
    } catch (error) {
        clearTimeout(timeoutId)
        throw error
    }
}

ctx.onmessage = async (event: MessageEvent<WorkerMessage>): Promise<void> => {
    const { type, messageId } = event.data
    const startTime = performance.now()
    
    try {
        if (type === 'PROCESS_TEXTURE') {
            // Legacy mode: process blob directly
            const { blob, textureSize, textureIndex } = event.data as TextureProcessingMessage
            
            console.debug('Worker processing blob:', { textureSize, textureIndex, blobSize: blob.size })
            
            const imageData = await processBlob(blob, textureSize)
            const processingTime = performance.now() - startTime
            
            const result: TextureProcessingResult = {
                type: 'TEXTURE_PROCESSED',
                imageData: imageData,
                textureIndex: textureIndex,
                messageId: messageId,
                processingTime: processingTime
            }
            
            // Transfer the ArrayBuffer to avoid copying
            ctx.postMessage(result, [imageData.buffer])
            
        } else if (type === 'FETCH_AND_PROCESS') {
            // New mode: fetch URL and process
            const { url, textureSize, textureIndex, gameName, timeout } = event.data as TextureFetchMessage
            
            console.debug('Worker fetching and processing:', { url, textureSize, textureIndex, gameName })
            
            // Fetch image from network
            const blob = await fetchImage(url, timeout || 10000)
            
            // Process the blob
            const imageData = await processBlob(blob, textureSize)
            const processingTime = performance.now() - startTime
            
            const result: TextureProcessingResult = {
                type: 'TEXTURE_PROCESSED',
                imageData: imageData,
                textureIndex: textureIndex,
                messageId: messageId,
                processingTime: processingTime,
                gameName: gameName,
                blob: blob // Return blob for main thread caching
            }
            
            // Transfer the ArrayBuffer to avoid copying
            ctx.postMessage(result, [imageData.buffer])
            
        } else {
            console.log('Worker ignoring unknown message type:', type)
        }
        
    } catch (error) {
        const gameName = (event.data as TextureFetchMessage).gameName
        const errorResult: TextureProcessingError = {
            type: 'TEXTURE_ERROR',
            error: error instanceof Error ? error.message : String(error),
            messageId: messageId,
            gameName: gameName
        }
        ctx.postMessage(errorResult)
    }
}
