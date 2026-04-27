import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CacheManager } from '../../../../src/steam/cache/SimpleCacheManager'

describe('CacheManager Unit Tests', () => {
    let cache: CacheManager

    beforeEach(() => {
        // Clear out any simulated local storage state before tests
        localStorage.clear()

        cache = new CacheManager({
            cacheDuration: 3600000, // 1 hour
            cachePrefix: 'test_api_',
            enableCache: true,
            maxCacheSize: 5 * 1024 * 1024
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('Basic CRUD Operations', () => {
        it('should set and get a value', () => {
            cache.set('key1', 'value1')
            const value = cache.get<string>('key1')
            expect(value).toBe('value1')
        })

        it('should return null for non-existent keys', () => {
            const value = cache.get('nonexistent')
            expect(value).toBeNull()
        })

        it('should overwrite existing keys', () => {
            cache.set('key1', 'value1')
            cache.set('key1', 'value2')
            const value = cache.get<string>('key1')
            expect(value).toBe('value2')
        })

        it('should list all keys without prefixes', () => {
            cache.set('key1', 'val1')
            cache.set('key2', 'val2')
            const keys = cache.getAllKeys()
            expect(keys).toContain('key1')
            expect(keys).toContain('key2')
            expect(keys.length).toBe(2)
        })

        it('should clear all entries', () => {
            cache.set('key1', 'val1')
            cache.clear()
            expect(cache.get('key1')).toBeNull()
            expect(cache.getAllKeys().length).toBe(0)
        })
    })

    describe('TTL and Expiration', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        it('should return null when entry exceeds global cache duration', () => {
            cache.set('key1', 'value1')
            
            // Advance time past the 1-hour global TTL
            vi.advanceTimersByTime(3600001)

            const value = cache.get<string>('key1')
            expect(value).toBeNull()
        })

        it('should enforce per-key TTL override', () => {
            cache.set('short_lived', 'val', { ttlMs: 1000 }) // 1 second
            
            vi.advanceTimersByTime(1001)

            // Even though global duration is 1 hour, this should expire
            expect(cache.get('short_lived')).toBeNull()
        })

        it('should keep items alive indefinitely if TTL is Infinity', () => {
            const immortalCache = new CacheManager({
                cacheDuration: Infinity,
                cachePrefix: 'immortal_',
                enableCache: true
            })

            immortalCache.set('forever', 'val')
            
            // Advance time by 10 years
            vi.advanceTimersByTime(10 * 365 * 24 * 60 * 60 * 1000)

            expect(immortalCache.get('forever')).toBe('val')
        })
    })

    describe('Stale-While-Revalidate (getStale)', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        it('should return stale data even if expired', () => {
            cache.set('key1', 'value1', { ttlMs: 1000 })
            
            vi.advanceTimersByTime(1001)

            // Normal get() would delete and return null
            expect(cache.getStale<string>('key1')).toBe('value1')
            
            // Should still be present for subsequent stale requests (caller replaces it)
            expect(cache.getStale<string>('key1')).toBe('value1')
        })

        it('should return null in getStale if key never existed', () => {
            expect(cache.getStale('ghost')).toBeNull()
        })
    })

    describe('Storage State Persistence', () => {
        it('should save and restore from localStorage on init', () => {
            // Set up a cache and save its state to local storage
            cache.set('persistent_key', 'persisted_val')
            cache.saveImmediately() // Manually trigger since unload isn't firing in test
            
            // Simulate page reload by creating a fresh cache instance
            const reloadedCache = new CacheManager({
                cacheDuration: 3600000,
                cachePrefix: 'test_api_',
                enableCache: true
            })
            
            const value = reloadedCache.get<string>('persistent_key')
            expect(value).toBe('persisted_val')
        })
        
        it('should ignore and drop state from localStorage if timestamp implies it expired while offline', () => {
            vi.useFakeTimers()
            
            cache.set('temp_key', 'temp_val')
            cache.saveImmediately()
            
            // Fast forward time while the 'app' is closed
            vi.advanceTimersByTime(3600001)
            
            // The reload occurs after the global TTL has elapsed
            const reloadedCache = new CacheManager({
                cacheDuration: 3600000,
                cachePrefix: 'test_api_',
                enableCache: true
            })
            
            expect(reloadedCache.get<string>('temp_key')).toBeNull()
        })
    })

    describe('Cache Disabling', () => {
        it('should not set or get values when enableCache is false', () => {
            const disabledCache = new CacheManager({
                cacheDuration: 3600000,
                cachePrefix: 'test_api_',
                enableCache: false
            })

            disabledCache.set('key1', 'val1')
            expect(disabledCache.get('key1')).toBeNull()
            expect(disabledCache.getStale('key1')).toBeNull()
        })
    })
})