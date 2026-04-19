/**
 * Client-side cache for Steam app details (categories, genres, artwork URLs, etc.)
 * 
 * Stores the metadata from batch-appdetails endpoint locally to avoid repeated
 * Lambda calls. Uses IndexedDB for persistence across sessions.
 */

import type { AppDetailsData } from '../batch/BatchAppDetailsClient'

interface CachedAppDetails {
    appid: number
    data: AppDetailsData
    cached_at: number
    schema_version?: number
}

export interface AppDetailsCacheResult {
    data: AppDetailsData
    isStale: boolean
}

export class AppDetailsCache {
    private static readonly DB_NAME = 'steam-app-details-cache'
    private static readonly DB_VERSION = 1
    private static readonly STORE_NAME = 'appdetails'
    
    // Increment this when the required payload changes (e.g. adding steamspy tags)
    // Entries with missing or older schema versions will be treated as cache misses
    public static readonly CURRENT_SCHEMA_VERSION = 2
    
    private db: IDBDatabase | null = null
    private initPromise: Promise<void> | null = null

    /**
     * Initialize IndexedDB connection
     */
    async init(): Promise<void> {
        if (this.db) return
        if (this.initPromise) return this.initPromise

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(AppDetailsCache.DB_NAME, AppDetailsCache.DB_VERSION)

            request.onerror = () => {
                console.error('❌ [AppDetailsCache] Failed to open IndexedDB:', request.error)
                this.initPromise = null
                reject(request.error)
            }

            request.onsuccess = () => {
                const db = request.result
                
                // Verify the object store exists before marking as ready
                if (!db.objectStoreNames.contains(AppDetailsCache.STORE_NAME)) {
                    console.error('❌ [AppDetailsCache] Object store missing - database schema not upgraded')
                    db.close()
                    this.initPromise = null
                    reject(new Error('Database schema not initialized'))
                    return
                }
                
                this.db = db
                console.log('✅ [AppDetailsCache] IndexedDB initialized')
                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result
                
                if (!db.objectStoreNames.contains(AppDetailsCache.STORE_NAME)) {
                    const store = db.createObjectStore(AppDetailsCache.STORE_NAME, { keyPath: 'appid' })
                    store.createIndex('cached_at', 'cached_at', { unique: false })
                    console.log('📦 [AppDetailsCache] Created object store')
                }
            }
        })

        return this.initPromise
    }

    /**
     * Get cached app details for a single game.
     * Returns stale entries too, marked with isStale=true.
     */
    async get(appid: number): Promise<AppDetailsCacheResult | null> {
        await this.init()
        if (!this.db) return null

        return new Promise((resolve) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readonly')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)
            const request = store.get(appid)

            request.onsuccess = () => {
                const cached = request.result as CachedAppDetails | undefined
                if (!cached) {
                    resolve(null)
                    return
                }

                resolve({
                    data: cached.data,
                    isStale: cached.schema_version !== AppDetailsCache.CURRENT_SCHEMA_VERSION
                })
            }

            request.onerror = () => {
                console.error(`❌ [AppDetailsCache] Failed to get appid ${appid}:`, request.error)
                resolve(null)
            }
        })
    }

    /**
     * Get cached app details for multiple games.
     * Returns stale entries too, marked with isStale=true.
     */
    async getMany(appids: number[]): Promise<Map<number, AppDetailsCacheResult>> {
        await this.init()
        const results = new Map<number, AppDetailsCacheResult>()

        if (!this.db) return results

        return new Promise((resolve) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readonly')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)

            let completed = 0
            const total = appids.length
            let staleCount = 0

            if (total === 0) {
                resolve(results)
                return
            }

            for (const appid of appids) {
                const request = store.get(appid)

                request.onsuccess = () => {
                    const cached = request.result as CachedAppDetails | undefined

                    if (cached) {
                        const isStale = cached.schema_version !== AppDetailsCache.CURRENT_SCHEMA_VERSION
                        if (isStale) {
                            staleCount++
                        }
                        results.set(appid, { data: cached.data, isStale })
                    }

                    completed++
                    if (completed === total) {
                        if (results.size > 0 && results.size < total) {
                            console.log(`📋 [AppDetailsCache] Cache: ${results.size}/${total} games (${staleCount} stale)`)
                        }
                        resolve(results)
                    }
                }

                request.onerror = () => {
                    completed++
                    if (completed === total) {
                        resolve(results)
                    }
                }
            }
        })
    }

    /**
     * Store app details for a single game
     */
    async set(appid: number, data: AppDetailsData): Promise<void> {
        await this.init()
        if (!this.db) return

        const cached: CachedAppDetails = {
            appid,
            data,
            cached_at: Date.now(),
            schema_version: AppDetailsCache.CURRENT_SCHEMA_VERSION
        }

        return new Promise((resolve, _reject) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readwrite')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)
            const request = store.put(cached)

            request.onsuccess = () => {
                resolve()
            }

            request.onerror = () => {
                console.error(`❌ [AppDetailsCache] Failed to cache appid ${appid}:`, request.error)
                _reject(request.error)
            }
        })
    }

    /**
     * Store app details for multiple games
     */
    async setMany(dataMap: Map<number, AppDetailsData>): Promise<void> {
        await this.init()
        if (!this.db || dataMap.size === 0) return

        return new Promise((resolve) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readwrite')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)

            let completed = 0
            const total = dataMap.size
            const now = Date.now()

            for (const [appid, data] of dataMap.entries()) {
                const cached: CachedAppDetails = {
                    appid,
                    data,
                    cached_at: now,
                    schema_version: AppDetailsCache.CURRENT_SCHEMA_VERSION
                }

                const request = store.put(cached)

                request.onsuccess = () => {
                    completed++
                    if (completed === total) {
                        resolve()
                    }
                }

                request.onerror = () => {
                    completed++
                    if (completed === total) {
                        resolve()
                    }
                }
            }
        })
    }

    /**
     * Clear all cached app details
     */
    async clear(): Promise<void> {
        await this.init()
        if (!this.db) return

        return new Promise((resolve, _reject) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readwrite')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)
            const request = store.clear()

            request.onsuccess = () => {
                console.log('🗑️ [AppDetailsCache] Cleared all cached app details')
                resolve()
            }

            request.onerror = () => {
                console.error('❌ [AppDetailsCache] Failed to clear cache:', request.error)
                _reject(request.error)
            }
        })
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{ count: number; oldestEntry: number | null; newestEntry: number | null }> {
        await this.init()
        if (!this.db) return { count: 0, oldestEntry: null, newestEntry: null }

        return new Promise((resolve) => {
            const transaction = this.db.transaction([AppDetailsCache.STORE_NAME], 'readonly')
            const store = transaction.objectStore(AppDetailsCache.STORE_NAME)
            const countRequest = store.count()

            countRequest.onsuccess = () => {
                const count = countRequest.result

                if (count === 0) {
                    resolve({ count: 0, oldestEntry: null, newestEntry: null })
                    return
                }

                const index = store.index('cached_at')
                const oldestRequest = index.openCursor(null, 'next')
                const newestRequest = index.openCursor(null, 'prev')

                let oldest: number | null = null
                let newest: number | null = null

                oldestRequest.onsuccess = () => {
                    if (oldestRequest.result) {
                        oldest = (oldestRequest.result.value as CachedAppDetails).cached_at
                    }

                    newestRequest.onsuccess = () => {
                        if (newestRequest.result) {
                            newest = (newestRequest.result.value as CachedAppDetails).cached_at
                        }
                        resolve({ count, oldestEntry: oldest, newestEntry: newest })
                    }
                }
            }

            countRequest.onerror = () => {
                resolve({ count: 0, oldestEntry: null, newestEntry: null })
            }
        })
    }
}
