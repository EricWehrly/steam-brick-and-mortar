/**
 * Generic IndexedDB-backed keyed cache. Owns the connection lifecycle (lazy open, guarded
 * against concurrent opens) and basic CRUD - no knowledge of what T is or what makes an entry
 * "complete."
 *
 * `keyPath` names the property IndexedDB derives each record's key from - it exists as a config
 * option (not hardcoded) specifically so an existing store's on-disk schema can be preserved
 * exactly when this class replaces a bespoke implementation (see AppDetailsCache, which passes
 * 'appid' to match its pre-existing store rather than introduce a schema migration for free).
 * IndexedDB can't change an existing store's keyPath in place, so treat this as fixed once a
 * store has real data in it.
 *
 * Intended usage: one instance per (dbName, storeName) pair, held privately and exposed through
 * a domain-specific static facade - see AppDetailsCache, which is also where merge/completeness
 * logic belongs (this class has no opinion on what "better data" means for a given T).
 */

import { Logger } from '../../utils/Logger'

export interface IndexedDbCacheResult<T> {
    data: T
    cachedAt: number
    isStale: boolean
}

export interface IndexedDbCacheConfig {
    dbName: string
    storeName: string
    keyPath: string
    /** IndexedDB's own schema version - bump only if the store's shape itself changes. */
    dbVersion?: number
    /** App-level payload version - bump when T's shape changes; older entries read back as stale. */
    currentSchemaVersion?: number
}

interface StoredRecord {
    data: unknown
    cached_at: number
    schema_version?: number
    [keyPath: string]: unknown
}

export class IndexedDbCache<T> {
    private readonly dbName: string
    private readonly storeName: string
    private readonly keyPath: string
    private readonly dbVersion: number
    private readonly currentSchemaVersion: number
    private readonly logger: ReturnType<typeof Logger.createLogFunctions>

    private db: IDBDatabase | null = null
    private initPromise: Promise<void> | null = null

    constructor(config: IndexedDbCacheConfig) {
        this.dbName = config.dbName
        this.storeName = config.storeName
        this.keyPath = config.keyPath
        this.dbVersion = config.dbVersion ?? 1
        this.currentSchemaVersion = config.currentSchemaVersion ?? 1
        this.logger = Logger.createLogFunctions(`IndexedDbCache(${config.storeName})`)
    }

    async init(): Promise<void> {
        if (this.db) return
        if (this.initPromise) return this.initPromise

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion)

            request.onerror = () => {
                this.logger.error(`Failed to open IndexedDB '${this.dbName}':`, request.error)
                this.initPromise = null
                reject(request.error)
            }

            request.onsuccess = () => {
                const db = request.result

                if (!db.objectStoreNames.contains(this.storeName)) {
                    this.logger.error(`Object store '${this.storeName}' missing - database schema not upgraded`)
                    db.close()
                    this.initPromise = null
                    reject(new Error(`Database schema not initialized for store '${this.storeName}'`))
                    return
                }

                this.db = db
                this.logger.debug(`IndexedDB '${this.dbName}' initialized`)
                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: this.keyPath })
                    store.createIndex('cached_at', 'cached_at', { unique: false })
                    this.logger.debug(`Created object store '${this.storeName}'`)
                }
            }
        })

        return this.initPromise
    }

    async get(key: number): Promise<IndexedDbCacheResult<T> | null> {
        await this.init()
        if (!this.db) return null

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly')
            const store = transaction.objectStore(this.storeName)
            const request = store.get(key)

            request.onsuccess = () => {
                const stored = request.result as StoredRecord | undefined
                resolve(stored ? this.toResult(stored) : null)
            }

            request.onerror = () => {
                this.logger.error(`Failed to get key ${key}:`, request.error)
                resolve(null)
            }
        })
    }

    async getMany(keys: number[]): Promise<Map<number, IndexedDbCacheResult<T>>> {
        await this.init()
        const results = new Map<number, IndexedDbCacheResult<T>>()
        if (!this.db || keys.length === 0) return results

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly')
            const store = transaction.objectStore(this.storeName)
            let completed = 0

            for (const key of keys) {
                const request = store.get(key)

                request.onsuccess = () => {
                    const stored = request.result as StoredRecord | undefined
                    if (stored) {
                        results.set(key, this.toResult(stored))
                    }
                    completed++
                    if (completed === keys.length) resolve(results)
                }

                request.onerror = () => {
                    completed++
                    if (completed === keys.length) resolve(results)
                }
            }
        })
    }

    /** Full-store scan. Fine at cache sizes in the thousands; callers filter/interpret results. */
    async getAllEntries(): Promise<Map<number, IndexedDbCacheResult<T>>> {
        await this.init()
        const results = new Map<number, IndexedDbCacheResult<T>>()
        if (!this.db) return results

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly')
            const store = transaction.objectStore(this.storeName)
            const request = store.getAll()

            request.onsuccess = () => {
                const all = request.result as StoredRecord[]
                for (const stored of all) {
                    results.set(stored[this.keyPath] as number, this.toResult(stored))
                }
                resolve(results)
            }

            request.onerror = () => {
                this.logger.error('Failed to scan all entries:', request.error)
                resolve(results)
            }
        })
    }

    async set(key: number, data: T): Promise<void> {
        await this.init()
        if (!this.db) return

        const stored = this.toStoredRecord(key, data, Date.now())

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite')
            const store = transaction.objectStore(this.storeName)
            const request = store.put(stored)

            request.onsuccess = () => resolve()
            request.onerror = () => {
                this.logger.error(`Failed to set key ${key}:`, request.error)
                reject(request.error)
            }
        })
    }

    async setMany(dataMap: Map<number, T>): Promise<void> {
        const now = Date.now()
        return this.setManyWithTimestamps(new Map([...dataMap].map(([key, data]) => [key, { data, cachedAt: now }])))
    }

    /**
     * Like setMany, but each entry carries its own cached_at instead of "now" - the merge path
     * (AppDetailsCache.mergeMany) needs this so a merged record's timestamp reflects the newest
     * *contributing* write, not merely when this particular write happened to run.
     */
    async setManyWithTimestamps(entries: Map<number, { data: T; cachedAt: number }>): Promise<void> {
        await this.init()
        if (!this.db || entries.size === 0) return

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite')
            const store = transaction.objectStore(this.storeName)
            let completed = 0

            for (const [key, entry] of entries.entries()) {
                const request = store.put(this.toStoredRecord(key, entry.data, entry.cachedAt))

                request.onsuccess = () => {
                    completed++
                    if (completed === entries.size) resolve()
                }
                request.onerror = () => {
                    completed++
                    if (completed === entries.size) resolve()
                }
            }
        })
    }

    async clear(): Promise<void> {
        await this.init()
        if (!this.db) return

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.storeName], 'readwrite')
            const store = transaction.objectStore(this.storeName)
            const request = store.clear()

            request.onsuccess = () => {
                this.logger.info(`Cleared store '${this.storeName}'`)
                resolve()
            }
            request.onerror = () => {
                this.logger.error('Failed to clear store:', request.error)
                reject(request.error)
            }
        })
    }

    async getStats(): Promise<{ count: number; oldestEntry: number | null; newestEntry: number | null }> {
        await this.init()
        if (!this.db) return { count: 0, oldestEntry: null, newestEntry: null }

        return new Promise((resolve) => {
            const transaction = this.db!.transaction([this.storeName], 'readonly')
            const store = transaction.objectStore(this.storeName)
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
                        oldest = (oldestRequest.result.value as StoredRecord).cached_at
                    }
                    newestRequest.onsuccess = () => {
                        if (newestRequest.result) {
                            newest = (newestRequest.result.value as StoredRecord).cached_at
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

    private toStoredRecord(key: number, data: T, cachedAt: number): StoredRecord {
        return {
            [this.keyPath]: key,
            data,
            cached_at: cachedAt,
            schema_version: this.currentSchemaVersion,
        }
    }

    private toResult(stored: StoredRecord): IndexedDbCacheResult<T> {
        return {
            data: stored.data as T,
            cachedAt: stored.cached_at,
            isStale: stored.schema_version !== this.currentSchemaVersion,
        }
    }
}
