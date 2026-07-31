/**
 * TextureWorker
 *
 * Main-thread manager for texture-processing.worker.
 * Extends ManagedWorker for standardised lifecycle and error handling.
 */

import type {
    TextureProcessingMessage,
    TextureFetchMessage,
    TextureLocalBlobMessage,
    TextureProcessingResult,
    TextureProcessingError,
    ArtworkPackDecodeMessage,
    ArtworkPackDecodeResult,
    ArtworkPackEntry,
    ArtworkPackTileResult
} from './texture-processing.worker'
import { Logger } from '../../../utils/Logger'
import { ManagedWorker } from '../../../utils/ManagedWorker'
import TextureProcessingWorker from './texture-processing.worker?worker'

export type { ArtworkPackEntry, ArtworkPackTileResult }

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

type TWIn = TextureProcessingMessage | TextureFetchMessage | TextureLocalBlobMessage | ArtworkPackDecodeMessage
type TWOut = TextureProcessingResult | TextureProcessingError | ArtworkPackDecodeResult

export class TextureWorker extends ManagedWorker<TWIn, TWOut> {
    public static logger = Logger.createLogFunctions(TextureWorker.name)
    // Side-channel: tracks whether to include blob in resolved result per messageId
    private readonly includeBlobFor = new Set<string>()
    private twCounter = 0

    constructor() {
        super(TextureProcessingWorker as unknown as new () => Worker, 'TextureWorker')
        TextureWorker.logger.lifecycle('Initialized')
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

    /**
     * Process image bytes already read from local disk (Tauri, not the network) - same flexible
     * dimensions/native-size handling as fetchAndProcessWithOptions, minus the network fetch.
     * `formatHint` (e.g. "library_600x900.jpg") stands in for a URL in the worker's high-res-check
     * filename match, since there's no real URL for a local file.
     */
    public async processLocalBytes(
        bytes: Uint8Array<ArrayBuffer>,
        formatHint: string,
        textureIndex: number,
        gameName: string,
        options: FetchAndProcessOptions = {}
    ): Promise<FetchAndProcessResult> {
        const messageId = this.nextMsgId(`local_${textureIndex}`)
        const blob = new Blob([bytes])
        const result = await this.send<TextureProcessingResult>({
            type: 'PROCESS_LOCAL_BLOB',
            blob,
            formatHint,
            textureWidth: options.textureWidth,
            textureHeight: options.textureHeight,
            useNativeSize: options.useNativeSize,
            textureIndex,
            messageId,
            gameName
        } as TextureLocalBlobMessage)

        if (result.type !== 'TEXTURE_PROCESSED') {
            throw new Error((result as unknown as TextureProcessingError).error)
        }

        return {
            imageData: result.imageData,
            processingTime: result.processingTime,
            width: result.width,
            height: result.height
        }
    }

    /**
     * Decode one "pack" grid image (see scripts/bake-f2p-artwork.sh) and crop+resize every tile
     * to both MID and HIGH sizes in a single worker round-trip. Used for pre-seeding
     * PixelDataCache at startup - see ArtworkPackSeeder.
     */
    public async decodeArtworkPack(
        packBlob: Blob,
        entries: ArtworkPackEntry[],
        tileWidth: number,
        tileHeight: number,
        midWidth: number,
        midHeight: number,
        highWidth: number,
        highHeight: number
    ): Promise<ArtworkPackTileResult[]> {
        const messageId = this.nextMsgId('pack')
        const result = await this.send<ArtworkPackDecodeResult>({
            type: 'DECODE_ARTWORK_PACK',
            packBlob,
            entries,
            tileWidth,
            tileHeight,
            midWidth,
            midHeight,
            highWidth,
            highHeight,
            messageId
        } as ArtworkPackDecodeMessage)

        if (result.type !== 'ARTWORK_PACK_DECODED') {
            throw new Error((result as unknown as TextureProcessingError).error)
        }

        return result.tiles
    }

    public override dispose(): void {
        this.includeBlobFor.clear()
        super.dispose()
    }
}
