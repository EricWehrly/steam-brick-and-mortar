/**
 * PixelDataCache - Web Worker-based IndexedDB cache for decoded texture pixel data
 * 
 * Performance Optimization: All IndexedDB operations run in a dedicated Web Worker
 * to prevent main thread blocking. This eliminates frame drops during texture loading.
 * 
 * Before (main thread IndexedDB): Cache hits took ~20-40ms, blocking rendering
 * After (worker-based): Cache hits are async with no main thread blocking
 * 
 * Architecture:
 * - Main thread: Coordinates requests, tracks stats
 * - Worker thread: All IndexedDB read/write operations
 * - ArrayBuffer transfer: Zero-copy data transfer from worker to main
 * 
 * Storage Trade-off:
 * - JPEG blob: ~30-50KB per image
 * - RGBA pixels (300×450): ~540KB per image (10-18x larger)
 * - For 800 games: ~432MB IndexedDB storage
 */

import { Logger } from '../../../utils/Logger'
import type {
    WorkerInMessage,
    WorkerOutMessage,
    GetResult,
    PutResult,
    InitResult,
    ClearResult,
    StatsResult
} from './pixel-cache.worker'

// Vite worker import
import PixelCacheWorker from './pixel-cache.worker?worker'

const log = Logger.withContext('PixelDataCache')

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

export class PixelDataCache {
    private static instance: PixelDataCache | null = null
    
    private worker: Worker | null = null
    private readonly dbName: string
    private readonly storeName: string
    private readonly version: number
    private initPromise: Promise<void> | null = null
    private workerReady = false
    
    /** Pending message callbacks */
    private pendingMessages = new Map<string, {
        resolve: (data: WorkerOutMessage) => void
        reject: (error: Error) => void
    }>()
    
    private stats: PixelCacheStats = {
        hits: 0,
        misses: 0,
        stores: 0,
        errors: 0,
        workerReady: false
    }
    
    private constructor(config: PixelDataCacheConfig = {}) {
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
    
    /**
     * Initialize the worker and IndexedDB connection
     */
    public async init(): Promise<void> {
        if (this.workerReady) return
        if (this.initPromise) return this.initPromise
        
        this.initPromise = this.initWorker()
        return this.initPromise
    }
    
    private async initWorker(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new PixelCacheWorker()
                
                this.worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
                    this.handleWorkerMessage(event.data)
                }
                
                this.worker.onerror = (error) => {
                    log.error('Worker error:', error.message)
                    this.stats.errors++
                }
                
                // Send init message
                const messageId = this.generateMessageId()
                
                this.pendingMessages.set(messageId, {
                    resolve: (data) => {
                        const result = data as InitResult
                        if (result.success) {
                            this.workerReady = true
                            this.stats.workerReady = true
                            log.lifecycle(`Worker initialized: ${this.dbName}/${this.storeName}`)
                            resolve()
                        } else {
                            reject(new Error(result.error ?? 'Worker init failed'))
                        }
                    },
                    reject
                })
                
                this.worker.postMessage({
                    type: 'INIT',
                    dbName: this.dbName,
                    storeName: this.storeName,
                    version: this.version,
                    messageId
                } satisfies WorkerInMessage)
                
            } catch (error) {
                log.error('Failed to create worker:', error)
                reject(error)
            }
        })
    }
    
    private handleWorkerMessage(data: WorkerOutMessage): void {
        const pending = this.pendingMessages.get(data.messageId)
        if (pending) {
            this.pendingMessages.delete(data.messageId)
            pending.resolve(data)
        }
    }
    
    private generateMessageId(): string {
        return `${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
    
    private async sendMessage<T extends WorkerOutMessage>(message: WorkerInMessage): Promise<T> {
        if (!this.worker) {
            await this.init()
        }
        
        if (!this.worker) {
            throw new Error('Worker not available')
        }
        
        return new Promise((resolve, reject) => {
            this.pendingMessages.set(message.messageId, {
                resolve: (data) => resolve(data as T),
                reject
            })
            
            // For PUT messages, transfer the ArrayBuffer
            if (message.type === 'PUT') {
                const putMessage = message as WorkerInMessage & { pixels: Uint8ClampedArray }
                const buffer = putMessage.pixels.buffer
                this.worker!.postMessage(message, [buffer])
            } else {
                this.worker!.postMessage(message)
            }
        })
    }
    
    /**
     * Get cached pixel data for a URL (runs off main thread!)
     */
    public async get(url: string): Promise<CachedPixelResult | null> {
        if (!this.workerReady) {
            await this.init()
        }
        
        try {
            const result = await this.sendMessage<GetResult>({
                type: 'GET',
                url,
                version: this.version,
                messageId: this.generateMessageId()
            })
            
            if (result.found && result.pixels) {
                this.stats.hits++
                return {
                    pixelData: result.pixels,
                    width: result.width!,
                    height: result.height!
                }
            } else {
                this.stats.misses++
                return null
            }
        } catch (error) {
            log.debug(`Cache read error for ${url}:`, error)
            this.stats.errors++
            return null
        }
    }
    
    /**
     * Store pixel data in cache (runs off main thread!)
     */
    public async put(
        url: string,
        pixels: Uint8ClampedArray,
        width: number,
        height: number
    ): Promise<void> {
        if (!this.workerReady) {
            await this.init()
        }
        
        try {
            // Make a copy since we're transferring ownership
            const pixelsCopy = new Uint8ClampedArray(pixels)
            
            await this.sendMessage<PutResult>({
                type: 'PUT',
                url,
                pixels: pixelsCopy,
                width,
                height,
                version: this.version,
                messageId: this.generateMessageId()
            })
            
            this.stats.stores++
        } catch (error) {
            log.debug(`Cache write error for ${url}:`, error)
            this.stats.errors++
        }
    }
    
    /**
     * Remove a specific entry from cache
     */
    public async delete(url: string): Promise<void> {
        if (!this.workerReady) return
        
        try {
            await this.sendMessage<ClearResult>({
                type: 'DELETE',
                url,
                messageId: this.generateMessageId()
            } as WorkerInMessage)
        } catch (error) {
            log.debug(`Cache delete error for ${url}:`, error)
        }
    }
    
    /**
     * Clear all cached pixel data
     */
    public async clear(): Promise<void> {
        if (!this.workerReady) return
        
        try {
            await this.sendMessage<ClearResult>({
                type: 'CLEAR',
                messageId: this.generateMessageId()
            })
            
            this.stats = { hits: 0, misses: 0, stores: 0, errors: 0, workerReady: true }
            log.lifecycle('Cleared all cached pixel data')
        } catch (error) {
            log.error('Failed to clear cache:', error)
        }
    }
    
    /**
     * Get cache statistics
     */
    public getStats(): PixelCacheStats & { hitRate: string } {
        const total = this.stats.hits + this.stats.misses
        const hitRate = total > 0 
            ? `${((this.stats.hits / total) * 100).toFixed(1)}%`
            : 'N/A'
        
        return {
            ...this.stats,
            hitRate
        }
    }
    
    /**
     * Get estimated storage usage
     */
    public async getStorageEstimate(): Promise<{ count: number; estimatedMB: number }> {
        if (!this.workerReady) {
            return { count: 0, estimatedMB: 0 }
        }
        
        try {
            const result = await this.sendMessage<StatsResult>({
                type: 'GET_STATS',
                messageId: this.generateMessageId()
            })
            
            return {
                count: result.count,
                estimatedMB: result.estimatedMB
            }
        } catch {
            return { count: 0, estimatedMB: 0 }
        }
    }
    
    /**
     * Diagnostic: Log cache stats
     */
    public async diagnose(): Promise<void> {
        const stats = this.getStats()
        const storage = await this.getStorageEstimate()
        
        console.group('📦 PixelDataCache Stats (Worker-based)')
        console.log(`Worker ready: ${stats.workerReady}`)
        console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${stats.hitRate}`)
        console.log(`Stores: ${stats.stores}, Errors: ${stats.errors}`)
        console.log(`Cached entries: ${storage.count}, Estimated size: ${storage.estimatedMB.toFixed(1)}MB`)
        console.groupEnd()
    }
    
    public dispose(): void {
        this.worker?.terminate()
        this.worker = null
        this.workerReady = false
        this.initPromise = null
        this.pendingMessages.clear()
        log.lifecycle('Disposed')
    }
}
