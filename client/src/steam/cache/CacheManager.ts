/**
 * Transparent caching layer that can instrument any method
 * Handles localStorage persistence and cache invalidation
 */

export interface CacheConfig {
    /** Cache duration in milliseconds (default: 1 hour) */
    cacheDuration: number;
    /** Enable localStorage caching (default: true) */
    enableCache: boolean;
    /** Cache key prefix for localStorage */
    cachePrefix: string;
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export interface CacheStats {
    totalEntries: number;
    resolveEntries: number;
    gamesEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    totalSize: number;
}

export class CacheManager {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private readonly config: CacheConfig;

    constructor(config: Partial<CacheConfig> = {}) {
        this.config = {
            cacheDuration: 60 * 60 * 1000, // 1 hour default
            enableCache: true,
            cachePrefix: 'steam_api_cache_',
            ...config
        };
        
        if (this.config.enableCache && typeof localStorage !== 'undefined') {
            this.loadFromStorage();
        }
    }

    /**
     * Wrap a method with caching
     */
    cached<TArgs extends any[], TReturn>(
        keyGenerator: (...args: TArgs) => string,
        method: (...args: TArgs) => Promise<TReturn>
    ) {
        return async (...args: TArgs): Promise<TReturn> => {
            if (!this.config.enableCache) {
                return method(...args);
            }

            const key = keyGenerator(...args);
            const cached = this.get<TReturn>(key);
            
            if (cached !== null) {
                return cached;
            }

            const result = await method(...args);
            this.set(key, result);
            return result;
        };
    }

    /**
     * Set cache entry
     */
    set<T>(key: string, data: T): void {
        if (!this.config.enableCache) return;

        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
        };

        this.cache.set(this.config.cachePrefix + key, entry);
        this.updateStorage();
    }

    /**
     * Get cache entry
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(this.config.cachePrefix + key);
        if (!entry) return null;

        // Check expiration
        const isExpired = (Date.now() - entry.timestamp) > this.config.cacheDuration;
        if (isExpired) {
            this.cache.delete(this.config.cachePrefix + key);
            return null;
        }

        return entry.data;
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
        if (typeof localStorage !== 'undefined') {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(this.config.cachePrefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const entries = Array.from(this.cache.entries());
        const resolveEntries = entries.filter(([key]) => key.includes('resolve_')).length;
        const gamesEntries = entries.filter(([key]) => key.includes('games_')).length;
        
        const timestamps = entries.map(([, entry]) => entry.timestamp);
        const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : null;
        const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : null;
        
        // Approximate size calculation
        const totalSize = entries.reduce((size, [key, entry]) => {
            return size + key.length + JSON.stringify(entry).length;
        }, 0) * 2; // Multiply by 2 for rough UTF-16 encoding size
        
        return {
            totalEntries: entries.length,
            resolveEntries,
            gamesEntries,
            oldestEntry,
            newestEntry,
            totalSize
        };
    }

    private updateStorage(): void {
        if (!this.config.enableCache || typeof localStorage === 'undefined') return;
        
        const state = JSON.stringify(Array.from(this.cache.entries()));
        localStorage.setItem(this.config.cachePrefix + 'state', state);
    }

    private loadFromStorage(): void {
        if (typeof localStorage === 'undefined') return;
        
        const state = localStorage.getItem(this.config.cachePrefix + 'state');
        if (!state) return;

        try {
            const entries = JSON.parse(state) as [string, CacheEntry<any>][];
            for (const [key, entry] of entries) {
                this.cache.set(key, entry);
            }
        } catch (error) {
            // Clear corrupted cache
            localStorage.removeItem(this.config.cachePrefix + 'state');
        }
    }
}
