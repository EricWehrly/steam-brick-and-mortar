/**
 * Generic caching layer that can wrap any method with caching functionality
 */

export interface CacheConfig {
    /** Cache duration in milliseconds (default: 1 hour) */
    cacheDuration: number
    /** Enable localStorage caching (default: true) */
    enableCache: boolean
    /** Cache key prefix for localStorage */
    cachePrefix: string
}

export interface CacheEntry<T> {
    data: T
    timestamp: number
}

export interface CacheStats {
    totalEntries: number
    cacheHits: number
    cacheMisses: number
}

/**
 * Generic caching layer that can wrap any method with caching functionality
 */
export class CacheManager {
    private cache: Map<string, CacheEntry<any>> = new Map()
    private readonly config: CacheConfig
    private pendingWrites: boolean = false
    private writeTimeout: number | null = null
    private readonly WRITE_DEBOUNCE_MS = 2000 // 2 seconds

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            cacheDuration: 60 * 60 * 1000, // 1 hour default
            enableCache: true,
            cachePrefix: 'cache_',
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
    withCache<TArgs extends any[], TResult>(
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
        
        const entry = this.cache.get(this.config.cachePrefix + key)
        if (!entry) {
            return null
        }
        
        // Check expiration
        const age = Date.now() - entry.timestamp
        if (age > this.config.cacheDuration) {
            this.cache.delete(this.config.cachePrefix + key)
            return null
        }
        
        return entry.data
    }

    /**
     * Set cache entry
     */
    set<T>(key: string, data: T): void {
        if (!this.config.enableCache) {
            return
        }
        
        this.cache.set(this.config.cachePrefix + key, {
            data,
            timestamp: Date.now()
        })
        
        this.scheduleSave()
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear()
        this.saveImmediately() // Save immediately on clear
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
        this.saveToStorage()
    }

    /**
     * Schedule a debounced save to storage
     */
    private scheduleSave(): void {
        // Clear any existing timeout
        if (this.writeTimeout) {
            clearTimeout(this.writeTimeout)
            this.writeTimeout = null
        }

        this.pendingWrites = true

        this.writeTimeout = setTimeout(() => {
            this.saveToStorage()
            this.pendingWrites = false
            this.writeTimeout = null
        }, this.WRITE_DEBOUNCE_MS)
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return {
            totalEntries: this.cache.size,
            cacheHits: 0, // Could track this if needed
            cacheMisses: 0 // Could track this if needed
        }
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
