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
    /** For square textures (legacy) */
    textureSize?: number
    /** For non-square textures (native resolution) */
    textureWidth?: number
    textureHeight?: number
    /** If true, use native image dimensions (skip resize entirely) */
    useNativeSize?: boolean
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
    /** Actual dimensions of returned image data */
    width: number
    height: number
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
let canvasWidth = 0
let canvasHeight = 0

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
 * Initialize or reuse offscreen canvas for the given dimensions
 */
function ensureCanvas(width: number, height: number): void {
    if (!offscreenCanvas || canvasWidth !== width || canvasHeight !== height) {
        offscreenCanvas = new OffscreenCanvas(width, height)
        offscreenContext = offscreenCanvas.getContext('2d')
        canvasWidth = width
        canvasHeight = height
        
        if (!offscreenContext) {
            throw new Error('Failed to create OffscreenCanvas context')
        }
    }
}

/**
 * Decode image blobs without browser color-space/alpha pre-processing so we
 * control artwork color transforms explicitly in the shader pipeline.
 */
async function createBitmapPreservingSourceColor(blob: Blob): Promise<ImageBitmap> {
    try {
        return await createImageBitmap(blob, {
            colorSpaceConversion: 'none',
            premultiplyAlpha: 'none'
        })
    } catch {
        // Fallback for engines that don't support the options object.
        return createImageBitmap(blob)
    }
}

/**
 * Process a blob into texture pixel data (legacy square mode)
 */
async function processBlob(
    blob: Blob, 
    textureSize: number
): Promise<Uint8ClampedArray> {
    ensureCanvas(textureSize, textureSize)
    
    // Create image bitmap from blob
    const imageBitmap = await createBitmapPreservingSourceColor(blob)
    
    // Clear and draw scaled to texture size
    offscreenContext!.clearRect(0, 0, textureSize, textureSize)
    offscreenContext!.drawImage(imageBitmap, 0, 0, textureSize, textureSize)
    
    // Extract image data (the expensive operation we're offloading)
    const imageData = offscreenContext!.getImageData(0, 0, textureSize, textureSize)
    
    // Clean up bitmap
    imageBitmap.close()
    
    return imageData.data
}

interface ProcessBlobResult {
    imageData: Uint8ClampedArray
    width: number
    height: number
}

/**
 * Process a blob into texture pixel data with flexible dimensions
 * @param useNativeSize If true, use image's native dimensions (no resize)
 */
async function processBlobWithDimensions(
    blob: Blob,
    targetWidth?: number,
    targetHeight?: number,
    useNativeSize?: boolean
): Promise<ProcessBlobResult> {
    // Create image bitmap from blob
    const imageBitmap = await createBitmapPreservingSourceColor(blob)
    
    // Determine output dimensions
    let width: number
    let height: number
    
    if (useNativeSize) {
        // Use native image dimensions
        width = imageBitmap.width
        height = imageBitmap.height
    } else if (targetWidth && targetHeight) {
        // Use specified dimensions
        width = targetWidth
        height = targetHeight
    } else {
        // Fallback: use native
        width = imageBitmap.width
        height = imageBitmap.height
    }

    // Most Steam library_600x900.jpg images are physically 300x450 on the CDN.
    // Log genuine high-res images so we can track which titles actually ship at full res.
    // Reference: https://steamcommunity.com/discussions/forum/1/4202490864582293420/
    if (imageBitmap.width > 300) {
        console.debug(`[TextureWorker] High-res CDN image detected: native ${imageBitmap.width}×${imageBitmap.height} (most titles are 300×450)`)
    }
    
    ensureCanvas(width, height)
    
    // Clear and draw (scaled if dimensions differ from native)
    offscreenContext!.clearRect(0, 0, width, height)
    offscreenContext!.drawImage(imageBitmap, 0, 0, width, height)
    
    // Extract image data
    const imageData = offscreenContext!.getImageData(0, 0, width, height)
    
    // Clean up bitmap
    imageBitmap.close()
    
    return {
        imageData: imageData.data,
        width,
        height
    }
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
            // Legacy mode: process blob directly (square textures)
            const { blob, textureSize, textureIndex } = event.data as TextureProcessingMessage
            
            const imageData = await processBlob(blob, textureSize)
            const processingTime = performance.now() - startTime
            
            const result: TextureProcessingResult = {
                type: 'TEXTURE_PROCESSED',
                imageData: imageData,
                textureIndex: textureIndex,
                messageId: messageId,
                processingTime: processingTime,
                width: textureSize,
                height: textureSize
            }
            
            // Transfer the ArrayBuffer to avoid copying
            ctx.postMessage(result, [imageData.buffer])
            
        } else if (type === 'FETCH_AND_PROCESS') {
            // New mode: fetch URL and process with flexible dimensions
            const { url, textureSize, textureWidth, textureHeight, useNativeSize, textureIndex, gameName, timeout } = event.data as TextureFetchMessage
            
            // Fetch image from network
            const blob = await fetchImage(url, timeout || 10000)
            
            // Process the blob with appropriate dimensions
            let processed: ProcessBlobResult
            
            if (useNativeSize || (textureWidth && textureHeight)) {
                // Use new flexible processing
                processed = await processBlobWithDimensions(blob, textureWidth, textureHeight, useNativeSize)
            } else if (textureSize) {
                // Legacy square mode
                const imageData = await processBlob(blob, textureSize)
                processed = { imageData, width: textureSize, height: textureSize }
            } else {
                // Default to native size if nothing specified
                processed = await processBlobWithDimensions(blob, undefined, undefined, true)
            }
            
            const processingTime = performance.now() - startTime
            
            const result: TextureProcessingResult = {
                type: 'TEXTURE_PROCESSED',
                imageData: processed.imageData,
                textureIndex: textureIndex,
                messageId: messageId,
                processingTime: processingTime,
                width: processed.width,
                height: processed.height,
                gameName: gameName,
                blob: blob // Return blob for main thread caching
            }
            
            // Transfer the ArrayBuffer to avoid copying
            ctx.postMessage(result, [processed.imageData.buffer])
            
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
