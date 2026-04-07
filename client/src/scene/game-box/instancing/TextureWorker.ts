/**
 * TextureWorker
 *
 * Main-thread manager for texture-processing.worker.
 * Extends ManagedWorker for standardised lifecycle and error handling.
 */

import type { 
    TextureProcessingMessage,
    TextureFetchMessage,
    TextureProcessingResult, 
    TextureProcessingError 
} from './texture-processing.worker'
import { Logger } from '../../../utils/Logger'
import { ManagedWorker } from '../../../utils/ManagedWorker'
import TextureProcessingWorker from './texture-processing.worker?worker'

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

type TWIn = TextureProcessingMessage | TextureFetchMessage
type TWOut = TextureProcessingResult | TextureProcessingError

export class TextureWorker extends ManagedWorker<TWIn, TWOut> {
    public static logger = Logger.createLogFunctions(TextureWorker.name)
    // Side-channel: tracks whether to include blob in resolved result per messageId
    private readonly includeBlobFor = new Set<string>()
    private twCounter = 0

    constructor() {
        super(TextureProcessingWorker as unknown as new () => Worker, 'TextureWorker')
        TextureWorker.logger.lifecycle('Initialized')
    }

    protected override handleMessage(data: TWOut): void {
        // nothing extra needed here - dispatch already resolved the pending promise
    }

    protected override onWorkerCrash(err: Error): void {
        TextureWorker.logger.error('Worker crashed:', err.message)
        this.includeBlobFor.clear()
    }

    private nextMsgId(prefix: string): string {
        return `${prefix}_${this.twCounter++}_${Date.now()}`
    }

    /**
     * Process texture from blob in web worker (legacy mode)
     */
    public async processTexture(blob: Blob, textureSize: number, textureIndex: number): Promise<Uint8ClampedArray> {
        const messageId = this.nextMsgId(`texture_${textureIndex}`)
        const result = await this.send<TextureProcessingResult>({
            type: 'PROCESS_TEXTURE',
            blob,
            textureSize,
            textureIndex,
            messageId
        } as TextureProcessingMessage)
        if (result.type !== 'TEXTURE_PROCESSED') throw new Error((result as unknown as TextureProcessingError).error)
        return result.imageData
    }

    /**
     * Fetch image from URL and process in web worker (legacy square textures)
     */
    public async fetchAndProcess(
        url: string, 
        textureSize: number, 
        textureIndex: number,
        gameName: string,
        timeout: number = 10000
    ): Promise<FetchAndProcessResult> {
        return this.fetchAndProcessWithOptions(url, textureIndex, gameName, { textureSize, timeout })
    }

    /**
     * Fetch image from URL and process in web worker with flexible options.
     */
    public async fetchAndProcessWithOptions(
        url: string,
        textureIndex: number,
        gameName: string,
        options: FetchAndProcessOptions = {}
    ): Promise<FetchAndProcessResult> {
        const messageId = this.nextMsgId(`fetch_${textureIndex}`)
        this.includeBlobFor.add(messageId)
        try {
            const result = await this.send<TextureProcessingResult>({
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
            } as TextureFetchMessage)

            if (result.type !== 'TEXTURE_PROCESSED') {
                throw new Error((result as unknown as TextureProcessingError).error)
            }

            const includeBlob = this.includeBlobFor.has(messageId)
            this.includeBlobFor.delete(messageId)
            return {
                imageData: result.imageData,
                blob: includeBlob ? result.blob : undefined,
                processingTime: result.processingTime,
                width: result.width,
                height: result.height
            }
        } catch (err) {
            this.includeBlobFor.delete(messageId)
            throw err
        }
    }

    public override dispose(): void {
        this.includeBlobFor.clear()
        super.dispose()
    }
}
