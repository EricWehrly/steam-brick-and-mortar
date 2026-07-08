/**
 * Generic caching layer that can wrap any method with caching functionality
 */

// Cross-platform timeout type that works in both Node.js and browser environments
type TimeoutHandle = ReturnType<typeof setTimeout>

export interface CacheConfig {
    /** Cache duration in milliseconds (default: 1 hour) */
    cacheDuration: number
    /** Enable localStorage caching (default: true) */
    enableCache: boolean
    /** Cache key prefix for localStorage */
    cachePrefix: string
    /** Maximum cache size in bytes (default: 100MB) */
    maxCacheSize: number
    /** Maximum number of cache entries (default: 1000) */
    maxEntries: number
}

export interface CacheEntry<T> {
    data: T
    timestamp: number
    lastAccessed: number
    size?: number // Estimated size in bytes
    ttlMs?: number // Per-entry override for TTL
}

export interface CacheStats {
    totalEntries: number
    totalSize: number
    cacheHits: number
    cacheMisses: number
}

/**
 * Generic caching layer that can wrap any method with caching functionality
 */
export class CacheManager {
    private cache: Map<string, CacheEntry<unknown>> = new Map()
    private readonly config: CacheConfig
    private pendingWrites: boolean = false
    private writeTimeout: TimeoutHandle | null = null
    private readonly WRITE_DEBOUNCE_MS = 2000 // 2 seconds

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            cacheDuration: 60 * 60 * 1000, // 1 hour default
            enableCache: true,
            cachePrefix: 'cache_',
            maxCacheSize: 100 * 1024 * 1024, // 100MB default
            maxEntries: 1000, // 1000 entries default
            ...config
        }
        
        if (this.config.enableCache && typeof localStorage !== 'undefined') {
            this.loadFromStorage()
            
            // Save immediately on page unload to prevent data loss
            if (typeof window !== 'undefined') {
                window.addEventListener('beforeunload', () => {
                    this.saveImmediately()
                })
            }
        }
    }

    /**
     * Wrap any async function with caching
     */
    withCache<TArgs extends unknown[], TResult>(
        fn: (...args: TArgs) => Promise<TResult>,
        getCacheKey: (...args: TArgs) => string
    ): (...args: TArgs) => Promise<TResult> {
        return async (...args: TArgs): Promise<TResult> => {
            const cacheKey = getCacheKey(...args)
            
            // Try cache first
            const cached = this.get<TResult>(cacheKey)
            if (cached) {
                return cached
            }
            
            // Execute function and cache result
            const result = await fn(...args)
            this.set(cacheKey, result)
            return result
        }
    }

    /**
     * Get from cache
     */
    get<T>(key: string): T | null {
        if (!this.config.enableCache) {
            return null
        }
        
        const fullKey = this.config.cachePrefix + key
        const entry = this.cache.get(fullKey)
        if (!entry) {
            return null
        }
        
        // Check expiration
        const age = Date.now() - entry.timestamp
        const duration = entry.ttlMs ?? this.config.cacheDuration
        if (age > duration) {
            this.cache.delete(fullKey)
            return null
        }
        
        // Update access time for LRU tracking
        entry.lastAccessed = Date.now()
        
        return entry.data as T | null
    }

    /**
     * Get stale cache entry if it exists (even if expired).
     * Used for stale-while-revalidate patterns.
     */
    getStale<T>(key: string): T | null {
        if (!this.config.enableCache) {
            return null
        }
        
        const fullKey = this.config.cachePrefix + key
        const entry = this.cache.get(fullKey)
        if (!entry) {
            return null
        }

        // We don't check expiration here because we explicitly want stale data
        // We also don't delete it; the caller is responsible for replacing it.

        // Update access time for LRU tracking
        entry.lastAccessed = Date.now()

        return entry.data as T | null
    }

    /**
     * Set cache entry
     */
    set<T>(key: string, data: T, options?: { ttlMs?: number }): void {
        if (!this.config.enableCache) {
            return
        }
        
        const now = Date.now()
        const entry: CacheEntry<T> = {
            data,
            timestamp: now,
            lastAccessed: now,
            size: this.estimateSize(data),
            ttlMs: options?.ttlMs
        }
        
        const fullKey = this.config.cachePrefix + key
        this.cache.set(fullKey, entry)
        
        // Defer cache resolution (size limits + storage) to avoid blocking
        this.deferCacheResolution()
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear()
        this.saveImmediately() // Save immediately on clear
    }

    /**
     * Remove entries whose unprefixed key starts with the given prefix (e.g. all
     * "resolve_*" entries), leaving unrelated entries untouched. Saves immediately.
     */
    deleteByPrefix(prefix: string): void {
        for (const key of this.getAllKeys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(this.config.cachePrefix + key)
            }
        }
        this.saveImmediately()
    }

    /**
     * Force immediate save to storage (for critical operations)
     */
    saveImmediately(): void {
        if (this.writeTimeout) {
            clearTimeout(this.writeTimeout)
            this.writeTimeout = null
        }
        this.pendingWrites = false
        
        // Perform immediate cache resolution (size management + storage)
        this.performCacheResolution()
    }

    /**
     * Get cache statistics including size information
     */
    getStats(): CacheStats {
        const totalSize = Array.from(this.cache.values())
            .reduce((sum, entry) => sum + (entry.size || 0), 0)
        
        return {
            totalEntries: this.cache.size,
            totalSize,
            cacheHits: 0, // Could track this if needed
            cacheMisses: 0 // Could track this if needed
        }
    }

    /**
     * Estimate size of data in bytes
     */
    private estimateSize<T>(data: T): number {
        try {
            // Simple estimation using JSON string length
            const jsonString = JSON.stringify(data)
            return jsonString.length * 2 // UTF-16 characters are 2 bytes each
        } catch {
            // Fallback for non-serializable data
            return 1024 // 1KB default estimate
        }
    }

    /**
     * Enforce cache size limits using LRU eviction
     */
    private enforceSizeLimits(): void {
        // Check entry count limit
        if (this.cache.size > this.config.maxEntries) {
            const entriesToEvict = this.cache.size - this.config.maxEntries
            this.evictLRUEntries(entriesToEvict)
        }

        // Check size limit
        const currentSize = this.calculateTotalSize()
        if (currentSize > this.config.maxCacheSize) {
            // Evict entries until we're under the limit
            this.evictBySize(this.config.maxCacheSize * 0.8) // Target 80% of max to avoid frequent evictions
        }
    }

    /**
     * Calculate total cache size in bytes
     */
    private calculateTotalSize(): number {
        return Array.from(this.cache.values())
            .reduce((sum, entry) => sum + (entry.size || 0), 0)
    }

    /**
     * Evict least recently used entries
     */
    private evictLRUEntries(count: number): void {
        // Sort entries by lastAccessed time (oldest first)
        const sortedEntries = Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

        // Remove the oldest entries
        for (let i = 0; i < Math.min(count, sortedEntries.length); i++) {
            const [key] = sortedEntries[i]
            this.cache.delete(key)
        }
    }

    /**
     * Evict entries by size until target size is reached
     */
    private evictBySize(targetSize: number): void {
        // Sort entries by lastAccessed time (oldest first)
        const sortedEntries = Array.from(this.cache.entries())
            .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

        let currentSize = this.calculateTotalSize()
        
        for (const [key, entry] of sortedEntries) {
            if (currentSize <= targetSize) {
                break
            }
            
            this.cache.delete(key)
            currentSize -= (entry.size || 0)
        }
    }

    /**
     * Defer cache resolution (size management + storage) to avoid blocking operations
     */
    private deferCacheResolution(): void {
        // Clear any existing timeout
        if (this.writeTimeout) {
            clearTimeout(this.writeTimeout)
            this.writeTimeout = null
        }

        this.pendingWrites = true

        this.writeTimeout = setTimeout(this.performCacheResolution.bind(this), this.WRITE_DEBOUNCE_MS)
    }

    /**
     * Named timeout handler for cache resolution (for better debugging)
     */
    private performCacheResolution(): void {
        // Enforce size limits first
        this.enforceSizeLimits()
        
        // Then save to storage
        this.saveToStorage()
        
        // Reset state
        this.pendingWrites = false
        this.writeTimeout = null
    }

    /**
     * Get all cache keys (without prefix)
     */
    getAllKeys(): string[] {
        return Array.from(this.cache.keys()).map(key => key.replace(this.config.cachePrefix, ''))
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem('cache_state')
            if (stored) {
                const entries = JSON.parse(stored)
                this.cache = new Map(entries)
            }
        } catch (error) {
            console.warn('Failed to load cache from storage:', error)
        }
    }

    private saveToStorage(): void {
        try {
            if (typeof localStorage !== 'undefined') {
                if (this.cache.size === 0) {    // no cache to store
                    localStorage.removeItem('cache_state')
                } else {
                    const entries = Array.from(this.cache.entries())
                    localStorage.setItem('cache_state', JSON.stringify(entries))
                }
            }
        } catch (error) {
            console.warn('Failed to save cache to storage:', error)
        }
    }
}
