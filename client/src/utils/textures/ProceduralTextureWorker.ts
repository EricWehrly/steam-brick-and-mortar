/**
 * ProceduralTextureWorker
 *
 * Main-thread manager for the procedural-texture.worker.
 * Wraps message-passing in a Promise API so callers get an ImageBitmap
 * without blocking the main thread.
 *
 * Usage:
 *   const worker = ProceduralTextureWorker.getInstance()
 *   const bitmap = await worker.generate('wood_enhanced', { grainStrength: 0.3, ... })
 *   const texture = new THREE.CanvasTexture(bitmap)  // or use from ImageBitmap
 */

import type {
    GenerateTextureMessage,
    ProceduralTextureType,
    TextureGeneratedResult,
    TextureGenerationError,
} from './procedural-texture.worker'
import { Logger } from '../Logger'
import ProceduralTextureWorkerModule from './procedural-texture.worker?worker'

interface PendingRequest {
    resolve: (bitmap: ImageBitmap) => void
    reject:  (err: Error) => void
}

export class ProceduralTextureWorker {
    private static readonly logger = Logger.createLogFunctions(ProceduralTextureWorker.name)
    private static instance: ProceduralTextureWorker | null = null

    private worker: Worker
    private pending = new Map<string, PendingRequest>()
    private nextId = 0
    private disposed = false

    private constructor() {
        this.worker = new ProceduralTextureWorkerModule()
        this.worker.onmessage = (e: MessageEvent<TextureGeneratedResult | TextureGenerationError>) => {
            this.handleMessage(e.data)
        }
        this.worker.onerror = (e) => {
            ProceduralTextureWorker.logger.error('Worker error:', e.message)
            // Reject all pending with the error
            for (const [, req] of this.pending) {
                req.reject(new Error(e.message))
            }
            this.pending.clear()
        }
    }

    public static getInstance(): ProceduralTextureWorker {
        if (!ProceduralTextureWorker.instance || ProceduralTextureWorker.instance.disposed) {
            ProceduralTextureWorker.instance = new ProceduralTextureWorker()
        }
        return ProceduralTextureWorker.instance
    }

    /** Generate a texture bitmap off the main thread. */
    public generate(
        textureType: ProceduralTextureType,
        options: Record<string, unknown> = {}
    ): Promise<ImageBitmap> {
        if (this.disposed) {
            return Promise.reject(new Error('ProceduralTextureWorker has been disposed'))
        }

        const messageId = `ptw_${this.nextId++}`

        return new Promise<ImageBitmap>((resolve, reject) => {
            this.pending.set(messageId, { resolve, reject })

            const msg: GenerateTextureMessage = {
                type: 'GENERATE',
                textureType,
                options,
                messageId,
            }
            this.worker.postMessage(msg)
        })
    }

    private handleMessage(data: TextureGeneratedResult | TextureGenerationError): void {
        const req = this.pending.get(data.messageId)
        if (!req) return
        this.pending.delete(data.messageId)

        if (data.type === 'RESULT') {
            ProceduralTextureWorker.logger.debug(
                `Generated ${data.messageId} in ${data.generationMs.toFixed(0)}ms`
            )
            req.resolve(data.bitmap)
        } else {
            req.reject(new Error(data.error))
        }
    }

    public dispose(): void {
        this.disposed = true
        this.worker.terminate()
        ProceduralTextureWorker.instance = null
        for (const [, req] of this.pending) {
            req.reject(new Error('ProceduralTextureWorker disposed'))
        }
        this.pending.clear()
    }
}
