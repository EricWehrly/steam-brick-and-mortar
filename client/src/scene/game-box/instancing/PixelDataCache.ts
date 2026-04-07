/**
 * PixelDataCache
 *
 * Web Worker-based IndexedDB cache for decoded texture pixel data.
 * Extends ManagedWorker for standardised lifecycle and error handling.
 *
 * Two-phase lifecycle:
 *   1. Construction: worker is started (by ManagedWorker base)
 *   2. init(): sends INIT message, waits for IndexedDB connection confirmation
 *
 * Performance: All IndexedDB operations run off the main thread to prevent
 * frame drops during texture loading.
 *
 * Storage trade-off (kept as design note):
 * - JPEG blob: ~30-50KB per image
 * - Decoded RGBA pixels (300x450): ~540KB per image (~10-18x larger)
 * - For 800 games: ~432MB IndexedDB storage
 */

import { Logger } from '../../../utils/Logger'
import { ManagedWorker } from '../../../utils/ManagedWorker'
import type {
    WorkerInMessage,
    WorkerOutMessage,
    GetResult,
    PutResult,
    InitResult,
    ClearResult,
    StatsResult
} from './pixel-cache.worker'
import PixelCacheWorker from './pixel-cache.worker?worker'

export interface PixelDataCacheConfig {
    dbName?: string
    storeName?: string
    version?: number
}

export interface PixelCacheStats {
    hits: number
    misses: number
    stores: number
    errors: number
    workerReady: boolean
}

export interface CachedPixelResult {
    pixelData: Uint8ClampedArray
    width: number
    height: number
}

/** Current cache version - bump when pixel format or dimensions change */
const CACHE_VERSION = 1

export class PixelDataCache extends ManagedWorker<WorkerInMessage, WorkerOutMessage> {
    private static instance: PixelDataCache | null = null
    public static logger = Logger.createLogFunctions(PixelDataCache.name)

    private readonly dbName: string
    private readonly storeName: string
    private readonly version: number
    private initPromise: Promise<void> | null = null
    private workerReady = false
    private pdcCounter = 0

    private stats: PixelCacheStats = {
        hits: 0,
        misses: 0,
        stores: 0,
        errors: 0,
        workerReady: false
    }

    private constructor(config: PixelDataCacheConfig = {}) {
        super(PixelCacheWorker as unknown as new () => Worker, 'PixelDataCache')
        this.dbName = config.dbName ?? 'SteamTexturePixels'
        this.storeName = config.storeName ?? 'pixels'
        this.version = config.version ?? CACHE_VERSION
    }

    public static getInstance(): PixelDataCache {
        if (!PixelDataCache.instance) {
            PixelDataCache.instance = new PixelDataCache()
        }
        return PixelDataCache.instance
    }

    protected override onWorkerCrash(_err: Error): void {
        // Generic crash logging/rejection is handled by ManagedWorker.
        // PixelDataCache-specific state reset lives here.
        this.stats.errors++
        this.workerReady = false
        this.initPromise = null
    }

    /**
     * Initialize the worker's IndexedDB connection.
     * Safe to call multiple times; only initializes once.
     *
     * Pattern note: this class uses a two-phase lifecycle (construct -> init).
     * TD [lifecycle-pattern]: document this pattern in a shared patterns.md.
     */
    public async init(): Promise<void> {
        if (this.workerReady) return
        if (this.initPromise) return this.initPromise

        this.initPromise = (async () => {
            const messageId = `pdc_${Date.now()}_${this.pdcCounter++}`
            const result = await this.send<InitResult>({
                type: 'INIT',
                dbName: this.dbName,
                storeName: this.storeName,
                version: this.version,
                messageId
            })
            if (!result.success) {
                throw new Error(result.error ?? 'Worker init failed')
            }
            this.workerReady = true
            this.stats.workerReady = true
            PixelDataCache.logger.lifecycle(`Worker initialized: ${this.dbName}/${this.storeName}`)
        })()

        return this.initPromise
    }

    private async ensureReady(): Promise<void> {
        if (!this.workerReady) await this.init()
    }

    /**
     * Get cached pixel data for a URL (runs off main thread)
     */
    public async get(url: string): Promise<CachedPixelResult | null> {
        await this.ensureReady()
        try {
            const result = await this.send<GetResult>({
                type: 'GET',
                url,
                version: this.version,
                messageId: `pdc_${Date.now()}_${this.pdcCounter++}`
            })
            if (result.found && result.pixels) {
                this.stats.hits++
                return { pixelData: result.pixels, width: result.width!, height: result.height! }
            }
            this.stats.misses++
            return null
        } catch {
            this.stats.errors++
            return null
        }
    }

    /**
     * Store pixel data for a URL (runs off main thread, zero-copy transfer)
     */
    public async put(
        url: string,
        pixels: Uint8ClampedArray,
        width: number,
        height: number
    ): Promise<boolean> {
        await this.ensureReady()
        return this.send<PutResult>({
            type: 'PUT',
            url,
            pixels,
            width,
            height,
            version: this.version,
            messageId: `pdc_${Date.now()}_${this.pdcCounter++}`
        }).then((result) => {
            if (result.success) this.stats.stores++
            return result.success
        }).catch(() => {
            this.stats.errors++
            return false
        })
    }

    /**
     * Clear all cached data
     */
    public async clear(): Promise<boolean> {
        await this.ensureReady()
        try {
            const result = await this.send<ClearResult>({
                type: 'CLEAR',
                messageId: `pdc_${Date.now()}_${this.pdcCounter++}`
            })
            return result.success
        } catch {
            return false
        }
    }

    public getStats(): PixelCacheStats & { hitRate: string } {
        const total = this.stats.hits + this.stats.misses
        const hitRate = total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : 'N/A'
        return { ...this.stats, hitRate }
    }

    public async getStorageEstimate(): Promise<{ count: number; estimatedMB: number }> {
        if (!this.workerReady) return { count: 0, estimatedMB: 0 }
        try {
            const result = await this.send<StatsResult>({
                type: 'GET_STATS',
                messageId: `pdc_${Date.now()}_${this.pdcCounter++}`
            })
            return { count: result.count, estimatedMB: result.estimatedMB }
        } catch {
            return { count: 0, estimatedMB: 0 }
        }
    }

    public async diagnose(): Promise<void> {
        const stats = this.getStats()
        const storage = await this.getStorageEstimate()
        console.group('PixelDataCache Stats (Worker-based)')
        console.log(`Worker ready: ${stats.workerReady}`)
        console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${stats.hitRate}`)
        console.log(`Stores: ${stats.stores}, Errors: ${stats.errors}`)
        console.log(`Cached entries: ${storage.count}, Estimated size: ${storage.estimatedMB.toFixed(1)}MB`)
        console.groupEnd()
    }

    public override dispose(): void {
        super.dispose()
        this.workerReady = false
        this.initPromise = null
        PixelDataCache.logger.lifecycle('Disposed')
    }
}
