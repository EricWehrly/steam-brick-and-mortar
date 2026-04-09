/// <reference lib="webworker" />
/**
 * Web Worker for IndexedDB pixel cache operations
 * 
 * Offloads IndexedDB read/write from the main thread to eliminate frame drops.
 * IndexedDB operations can take 20-40ms and block rendering when on main thread.
 * 
 * This worker handles:
 * - Opening/initializing the IndexedDB database
 * - Reading cached pixel data (get)
 * - Writing pixel data (put) with batching
 * - Cache management (clear, delete)
 */

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope

export {}

// === Message Types ===

export interface InitMessage {
    type: 'INIT'
    dbName: string
    storeName: string
    version: number
    messageId: string
}

export interface GetMessage {
    type: 'GET'
    url: string
    version: number
    messageId: string
}

export interface PutMessage {
    type: 'PUT'
    url: string
    pixels: Uint8ClampedArray
    width: number
    height: number
    version: number
    messageId: string
}

export interface ClearMessage {
    type: 'CLEAR'
    messageId: string
}

export interface DeleteMessage {
    type: 'DELETE'
    url: string
    messageId: string
}

export interface GetStatsMessage {
    type: 'GET_STATS'
    messageId: string
}

export type WorkerInMessage = InitMessage | GetMessage | PutMessage | ClearMessage | DeleteMessage | GetStatsMessage

export interface InitResult {
    type: 'INIT_RESULT'
    success: boolean
    error?: string
    messageId: string
}

export interface GetResult {
    type: 'GET_RESULT'
    found: boolean
    pixels?: Uint8ClampedArray
    width?: number
    height?: number
    messageId: string
}

export interface PutResult {
    type: 'PUT_RESULT'
    success: boolean
    error?: string
    messageId: string
}

export interface ClearResult {
    type: 'CLEAR_RESULT'
    success: boolean
    messageId: string
}

export interface DeleteResult {
    type: 'DELETE_RESULT'
    success: boolean
    messageId: string
}

export interface StatsResult {
    type: 'STATS_RESULT'
    count: number
    estimatedMB: number
    messageId: string
}

export type WorkerOutMessage = InitResult | GetResult | PutResult | ClearResult | DeleteResult | StatsResult

// === Worker State ===

interface CachedPixelData {
    url: string
    pixels: Uint8ClampedArray
    width: number
    height: number
    cachedAt: number
    version: number
}

let db: IDBDatabase | null = null
let storeName = 'pixels'
let dbVersion = 1

// Write batching
const writeQueue: CachedPixelData[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 500
const MAX_QUEUE_SIZE = 10

// === IndexedDB Operations ===

function openDatabase(dbName: string, version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = version == null ? indexedDB.open(dbName) : indexedDB.open(dbName, version)

        request.onerror = () => {
            reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
        }

        request.onblocked = () => {
            reject(new Error('Failed to open IndexedDB: open request was blocked by another tab/session'))
        }

        request.onsuccess = () => {
            resolve(request.result)
        }
    })
}

async function ensureStoreExists(dbName: string): Promise<IDBDatabase> {
    const initialDb = await openDatabase(dbName)

    if (initialDb.objectStoreNames.contains(storeName)) {
        return initialDb
    }

    // Newly-created DBs (or legacy DBs) may be missing the store.
    // Reopen with a bumped schema version to create it.
    const nextVersion = Math.max(1, initialDb.version + 1)
    initialDb.close()

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, nextVersion)

        request.onerror = () => {
            reject(new Error(`Failed to upgrade IndexedDB schema: ${request.error?.message}`))
        }

        request.onblocked = () => {
            reject(new Error('Failed to upgrade IndexedDB schema: request was blocked by another tab/session'))
        }

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result
            if (!database.objectStoreNames.contains(storeName)) {
                const objectStore = database.createObjectStore(storeName, { keyPath: 'url' })
                objectStore.createIndex('cachedAt', 'cachedAt', { unique: false })
            }
        }

        request.onsuccess = () => {
            resolve(request.result)
        }
    })
}

async function initDatabase(dbName: string, store: string, version: number): Promise<void> {
    storeName = store
    dbVersion = version
    db = await ensureStoreExists(dbName)
}

async function getPixelData(url: string, version: number): Promise<CachedPixelData | null> {
    if (!db) return null
    
    return new Promise((resolve) => {
        const transaction = db!.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
        const request = store.get(url)
        
        request.onerror = () => resolve(null)
        request.onsuccess = () => {
            const cached = request.result as CachedPixelData | undefined
            
            if (!cached || cached.version !== version) {
                resolve(null)
                return
            }
            
            resolve(cached)
        }
    })
}

function queueWrite(entry: CachedPixelData): void {
    writeQueue.push(entry)
    
    if (writeQueue.length >= MAX_QUEUE_SIZE) {
        flushWriteQueue()
        return
    }
    
    if (!flushTimer) {
        flushTimer = setTimeout(() => flushWriteQueue(), FLUSH_INTERVAL_MS)
    }
}

function flushWriteQueue(): void {
    if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
    }
    
    if (writeQueue.length === 0 || !db) return
    
    const itemsToWrite = writeQueue.splice(0)
    
    const transaction = db.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    
    for (const entry of itemsToWrite) {
        store.put(entry)
    }
    
    // Don't wait for completion - fire and forget
}

async function clearCache(): Promise<void> {
    if (!db) return
    
    return new Promise((resolve) => {
        const transaction = db!.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const request = store.clear()
        
        request.onerror = () => resolve()
        request.onsuccess = () => resolve()
    })
}

async function deleteEntry(url: string): Promise<void> {
    if (!db) return
    
    return new Promise((resolve) => {
        const transaction = db!.transaction(storeName, 'readwrite')
        const store = transaction.objectStore(storeName)
        const request = store.delete(url)
        
        request.onerror = () => resolve()
        request.onsuccess = () => resolve()
    })
}

async function getStats(): Promise<{ count: number; estimatedMB: number }> {
    if (!db) return { count: 0, estimatedMB: 0 }
    
    return new Promise((resolve) => {
        const transaction = db!.transaction(storeName, 'readonly')
        const store = transaction.objectStore(storeName)
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

// === Message Handler ===

ctx.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
    const message = event.data
    
    switch (message.type) {
        case 'INIT': {
            try {
                await initDatabase(message.dbName, message.storeName, message.version)
                ctx.postMessage({
                    type: 'INIT_RESULT',
                    success: true,
                    messageId: message.messageId
                } satisfies InitResult)
            } catch (error) {
                ctx.postMessage({
                    type: 'INIT_RESULT',
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    messageId: message.messageId
                } satisfies InitResult)
            }
            break
        }
        
        case 'GET': {
            const cached = await getPixelData(message.url, message.version)
            
            if (cached) {
                // Transfer the ArrayBuffer for zero-copy
                const buffer = cached.pixels.buffer
                ctx.postMessage({
                    type: 'GET_RESULT',
                    found: true,
                    pixels: cached.pixels,
                    width: cached.width,
                    height: cached.height,
                    messageId: message.messageId
                } satisfies GetResult, [buffer])
            } else {
                ctx.postMessage({
                    type: 'GET_RESULT',
                    found: false,
                    messageId: message.messageId
                } satisfies GetResult)
            }
            break
        }
        
        case 'PUT': {
            const entry: CachedPixelData = {
                url: message.url,
                pixels: message.pixels,
                width: message.width,
                height: message.height,
                cachedAt: Date.now(),
                version: message.version
            }
            
            queueWrite(entry)
            
            ctx.postMessage({
                type: 'PUT_RESULT',
                success: true,
                messageId: message.messageId
            } satisfies PutResult)
            break
        }
        
        case 'CLEAR': {
            await clearCache()
            ctx.postMessage({
                type: 'CLEAR_RESULT',
                success: true,
                messageId: message.messageId
            } satisfies ClearResult)
            break
        }
        
        case 'DELETE': {
            await deleteEntry(message.url)
            ctx.postMessage({
                type: 'DELETE_RESULT',
                success: true,
                messageId: message.messageId
            } satisfies DeleteResult)
            break
        }
        
        case 'GET_STATS': {
            const stats = await getStats()
            ctx.postMessage({
                type: 'STATS_RESULT',
                count: stats.count,
                estimatedMB: stats.estimatedMB,
                messageId: message.messageId
            } satisfies StatsResult)
            break
        }
    }
}

// Global error handler
ctx.onerror = (event: ErrorEvent): boolean => {
    console.error('PixelCacheWorker error:', event.message)
    return true
}
