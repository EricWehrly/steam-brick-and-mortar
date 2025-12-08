/**
 * PixelDataCache - IndexedDB cache for decoded texture pixel data
 * 
 * Performance Optimization: Caches raw RGBA pixel arrays instead of JPEG blobs.
 * This skips the entire decode pipeline (createImageBitmap, canvas draw, getImageData)
 * on cache hits, reducing load time from ~50ms to ~1ms per texture.
 * 
 * Storage Trade-off:
 * - JPEG blob: ~30-50KB per image
 * - RGBA pixels (300×450): ~540KB per image (10-18x larger)
 * - For 800 games: ~432MB IndexedDB storage
 * 
 * This is acceptable because:
 * - Modern browsers support multi-GB IndexedDB storage
 * - The 50x speed improvement on cache hits is worth the storage cost
 * - Users can clear browser data if storage is a concern
 */

import { Logger } from '../../../utils/Logger'

const log = Logger.withContext('PixelDataCache')

interface CachedPixelData {
    /** URL used as cache key */
    url: string
    /** Raw RGBA pixel data */
    pixels: Uint8ClampedArray
    /** Width of the image */
    width: number
    /** Height of the image */
    height: number
    /** When this was cached (for potential TTL/cleanup) */
    cachedAt: number
    /** Version tag for cache invalidation on dimension changes */
    version: number
}

export interface PixelDataCacheConfig {
    /** IndexedDB database name */
    dbName?: string
    /** Object store name */
    storeName?: string
    /** Cache version - bump to invalidate all cached data */
    version?: number
}

export interface PixelCacheStats {
    hits: number
    misses: number
    stores: number
    errors: number
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
    
    private db: IDBDatabase | null = null
    private readonly dbName: string
    private readonly storeName: string
    private readonly version: number
    private initPromise: Promise<void> | null = null
    
    private stats: PixelCacheStats = {
        hits: 0,
        misses: 0,
        stores: 0,
        errors: 0
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
     * Initialize IndexedDB connection
     * Safe to call multiple times - will return existing init promise
     */
    public async init(): Promise<void> {
        if (this.db) return
        if (this.initPromise) return this.initPromise
        
        this.initPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                log.warn('IndexedDB not available - pixel cache disabled')
                resolve()
                return
            }
            
            const request = indexedDB.open(this.dbName, this.version)
            
            request.onerror = () => {
                log.error('Failed to open IndexedDB:', request.error)
                this.stats.errors++
                reject(request.error)
            }
            
            request.onsuccess = () => {
                this.db = request.result
                log.lifecycle(`Initialized: ${this.dbName}/${this.storeName}`)
                resolve()
            }
            
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                
                // Delete old store if exists (version upgrade = cache invalidation)
                if (db.objectStoreNames.contains(this.storeName)) {
                    db.deleteObjectStore(this.storeName)
                    log.lifecycle('Cleared old pixel cache (version upgrade)')
                }
                
                // Create new store with URL as key
                const store = db.createObjectStore(this.storeName, { keyPath: 'url' })
                store.createIndex('cachedAt', 'cachedAt', { unique: false })
                
                log.lifecycle('Created pixel cache store')
            }
        })
        
        return this.initPromise
    }
    
    /**
     * Get cached pixel data for a URL
     * @returns Pixel data with dimensions if cached, null if not found
     */
    public async get(url: string): Promise<CachedPixelResult | null> {
        if (!this.db) {
            await this.init()
            if (!this.db) return null
        }
        
        const db = this.db // Capture for closure
        
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readonly')
            const store = transaction.objectStore(this.storeName)
            const request = store.get(url)
            
            request.onerror = () => {
                log.debug(`Cache read error for ${url}:`, request.error)
                this.stats.errors++
                resolve(null)
            }
            
            request.onsuccess = () => {
                const cached = request.result as CachedPixelData | undefined
                
                if (!cached) {
                    this.stats.misses++
                    resolve(null)
                    return
                }
                
                // Validate version
                if (cached.version !== this.version) {
                    log.debug(`Cache version mismatch for ${url}: cached v${cached.version}, current v${this.version}`)
                    this.stats.misses++
                    resolve(null)
                    return
                }
                
                this.stats.hits++
                resolve({
                    pixelData: cached.pixels,
                    width: cached.width,
                    height: cached.height
                })
            }
        })
    }
    
    /**
     * Store pixel data in cache
     */
    public async put(
        url: string,
        pixels: Uint8ClampedArray,
        width: number,
        height: number
    ): Promise<void> {
        if (!this.db) {
            await this.init()
            if (!this.db) return
        }
        
        const db = this.db // Capture for closure
        
        const entry: CachedPixelData = {
            url,
            pixels,
            width,
            height,
            cachedAt: Date.now(),
            version: this.version
        }
        
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readwrite')
            const store = transaction.objectStore(this.storeName)
            const request = store.put(entry)
            
            request.onerror = () => {
                log.debug(`Cache write error for ${url}:`, request.error)
                this.stats.errors++
                resolve()
            }
            
            request.onsuccess = () => {
                this.stats.stores++
                resolve()
            }
        })
    }
    
    /**
     * Remove a specific entry from cache
     */
    public async delete(url: string): Promise<void> {
        if (!this.db) return
        
        const db = this.db // Capture for closure
        
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readwrite')
            const store = transaction.objectStore(this.storeName)
            const request = store.delete(url)
            
            request.onerror = () => resolve()
            request.onsuccess = () => resolve()
        })
    }
    
    /**
     * Clear all cached pixel data
     */
    public async clear(): Promise<void> {
        if (!this.db) return
        
        const db = this.db // Capture for closure
        
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readwrite')
            const store = transaction.objectStore(this.storeName)
            const request = store.clear()
            
            request.onerror = () => {
                log.error('Failed to clear cache:', request.error)
                resolve()
            }
            
            request.onsuccess = () => {
                log.lifecycle('Cleared all cached pixel data')
                this.stats = { hits: 0, misses: 0, stores: 0, errors: 0 }
                resolve()
            }
        })
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
        if (!this.db) {
            return { count: 0, estimatedMB: 0 }
        }
        
        const db = this.db // Capture for closure
        
        return new Promise((resolve) => {
            const transaction = db.transaction(this.storeName, 'readonly')
            const store = transaction.objectStore(this.storeName)
            const countRequest = store.count()
            
            countRequest.onerror = () => resolve({ count: 0, estimatedMB: 0 })
            countRequest.onsuccess = () => {
                const count = countRequest.result
                // Estimate: 300×450×4 = 540KB per entry + ~100 bytes overhead
                const estimatedMB = (count * (540 * 1024 + 100)) / (1024 * 1024)
                resolve({ count, estimatedMB })
            }
        })
    }
    
    /**
     * Diagnostic: Log cache stats
     */
    public async diagnose(): Promise<void> {
        const stats = this.getStats()
        const storage = await this.getStorageEstimate()
        
        console.group('📦 PixelDataCache Stats')
        console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${stats.hitRate}`)
        console.log(`Stores: ${stats.stores}, Errors: ${stats.errors}`)
        console.log(`Cached entries: ${storage.count}, Estimated size: ${storage.estimatedMB.toFixed(1)}MB`)
        console.groupEnd()
    }
    
    public dispose(): void {
        this.db?.close()
        this.db = null
        this.initPromise = null
        log.lifecycle('Disposed')
    }
}
