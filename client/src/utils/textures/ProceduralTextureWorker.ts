/**
 * ProceduralTextureWorker
 *
 * Main-thread manager for the procedural-texture.worker.
 * Extends ManagedWorker for standardised lifecycle and error handling.
 *
 * Usage:
 *   const bitmap = await ProceduralTextureWorker.instance.generate('wood_enhanced', { ... })
 */

import type {
    GenerateTextureMessage,
    ProceduralTextureType,
    TextureGeneratedResult,
    TextureGenerationError,
} from './procedural-texture.worker'
import ProceduralTextureWorkerModule from './procedural-texture.worker?worker'
import { ManagedWorker } from '../ManagedWorker'

type PTWIn = GenerateTextureMessage
type PTWOut = TextureGeneratedResult | TextureGenerationError

export class ProceduralTextureWorker extends ManagedWorker<PTWIn, PTWOut> {
    private static _instance: ProceduralTextureWorker | null = null

    private constructor() {
        super(ProceduralTextureWorkerModule as unknown as new () => Worker, 'ProceduralTextureWorker')
    }

    public static get instance(): ProceduralTextureWorker {
        if (!ProceduralTextureWorker._instance || ProceduralTextureWorker._instance.isDisposed) {
            ProceduralTextureWorker._instance = new ProceduralTextureWorker()
        }
        return ProceduralTextureWorker._instance
    }

    /** @deprecated Use ProceduralTextureWorker.instance */
    public static getInstance(): ProceduralTextureWorker {
        return ProceduralTextureWorker.instance
    }

    /** Generate a texture bitmap off the main thread. */
    public async generate(
        textureType: ProceduralTextureType,
        options: Record<string, unknown> = {}
    ): Promise<ImageBitmap> {
        const response = await this.send<PTWOut>({
            type: 'GENERATE',
            textureType,
            options,
            messageId: this.nextId(),
        })
        if (response.type === 'ERROR') {
            throw new Error(response.error)
        }
        return response.bitmap
    }

    public override dispose(): void {
        super.dispose()
        ProceduralTextureWorker._instance = null
    }
}
