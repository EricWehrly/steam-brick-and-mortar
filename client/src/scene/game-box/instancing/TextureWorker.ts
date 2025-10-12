/**
 * Web Worker for texture processing using OffscreenCanvas
 * Offloads expensive getImageData operations from the main thread
 */

interface TextureProcessingMessage {
    type: 'PROCESS_TEXTURE'
    blob: Blob
    textureSize: number
    textureIndex: number
    messageId: string
}

interface TextureProcessingResult {
    type: 'TEXTURE_PROCESSED'
    imageData: Uint8Array
    textureIndex: number
    messageId: string
    processingTime: number
}

interface TextureProcessingError {
    type: 'TEXTURE_ERROR'
    error: string
    messageId: string
}

// TODO: Extract this to a file that can properly render it (like a .worker.ts file loaded with a bundler or a .js file) 
// Worker script (plain JavaScript for browser compatibility)
const workerScript = `
let offscreenCanvas = null;
let offscreenContext = null;

// Global error handler for the worker
self.onerror = function(message, filename, lineno, colno, error) {
    console.error('Worker script error:', { message, filename, lineno, colno, error });
    self.postMessage({
        type: 'TEXTURE_ERROR',
        error: 'Worker script error: ' + message,
        messageId: 'global-error'
    });
    return true;
};

self.onmessage = async function(event) {
    try {
        // console.debug('Worker received message:', event.data);
        const { type, blob, textureSize, textureIndex, messageId } = event.data;
        
        if (type !== 'PROCESS_TEXTURE') {
            console.log('Worker ignoring message type:', type);
            return;
        }
        
        console.debug('Worker processing texture:', { textureSize, textureIndex, blobSize: blob.size });
        const startTime = performance.now();
        
        try {
        // Initialize offscreen canvas if needed
        if (!offscreenCanvas || offscreenCanvas.width !== textureSize) {
            offscreenCanvas = new OffscreenCanvas(textureSize, textureSize);
            offscreenContext = offscreenCanvas.getContext('2d');
            
            if (!offscreenContext) {
                throw new Error('Failed to create OffscreenCanvas context');
            }
        }
        
        // Create image bitmap from blob
        const imageBitmap = await createImageBitmap(blob);
        
        // Clear and draw
        offscreenContext.clearRect(0, 0, textureSize, textureSize);
        offscreenContext.drawImage(imageBitmap, 0, 0, textureSize, textureSize);
        
        // Extract image data (this is the expensive operation)
        const imageData = offscreenContext.getImageData(0, 0, textureSize, textureSize);
        
        // Clean up
        imageBitmap.close();
        
        const processingTime = performance.now() - startTime;
        
        // Send back the processed data
        const result = {
            type: 'TEXTURE_PROCESSED',
            imageData: imageData.data,
            textureIndex: textureIndex,
            messageId: messageId,
            processingTime: processingTime
        };
        
        // Transfer the ArrayBuffer to avoid copying
        self.postMessage(result, [imageData.data.buffer]);
        
    } catch (error) {
        const errorResult = {
            type: 'TEXTURE_ERROR',
            error: error instanceof Error ? error.message : String(error),
            messageId: messageId
        };
        
        self.postMessage(errorResult);
    }
    } catch (outerError) {
        console.error('Worker message handler error:', outerError);
        const errorResult = {
            type: 'TEXTURE_ERROR',
            error: 'Worker message handler error: ' + outerError.message,
            messageId: event.data ? event.data.messageId : 'unknown'
        };
        self.postMessage(errorResult);
    }
};
`

export class TextureWorker {
    private worker: Worker
    private pendingMessages = new Map<string, {
        resolve: (data: Uint8Array) => void
        reject: (error: Error) => void
    }>()
    
    constructor() {
        // Create worker from script string
        const workerBlob = new Blob([workerScript], { type: 'application/javascript' })
        this.worker = new Worker(URL.createObjectURL(workerBlob))
        
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
    public async processTexture(blob: Blob, textureSize: number, textureIndex: number): Promise<Uint8Array> {
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
        for (const [messageId, pending] of this.pendingMessages) {
            pending.reject(new Error('Worker disposed'))
        }
        this.pendingMessages.clear()
        
        this.worker.terminate()
        console.debug('🔧 TextureWorker disposed')
    }
}