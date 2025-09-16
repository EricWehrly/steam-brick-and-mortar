/**
 * Unit tests for CacheManager
 * Tests caching functionality with mocks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CacheManager } from '../../src/steam/cache/SimpleCacheManager'
import { setupLocalStorageMock } from '../utils/test-helpers'

describe('CacheManager Unit Tests', () => {
    let cacheManager: CacheManager
    let localStorageMock: any

    beforeEach(() => {
        // Setup fake timers for TTL testing
        vi.useFakeTimers()
        
        // Setup localStorage mock
        localStorageMock = setupLocalStorageMock()
        
        // Clear all mocks and storage
        vi.clearAllMocks()
        localStorageMock.storage.clear()
        
        // Create fresh cache manager
        cacheManager = new CacheManager()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('Basic Caching', () => {
        it('should store and retrieve values from cache', () => {
            const key = 'test-key'
            const value = { data: 'test-value' }
            
            // Store value
            cacheManager.set(key, value)
            
            // Retrieve value
            const retrieved = cacheManager.get(key)
            
            expect(retrieved).toEqual(value)
        })

        it('should return null for non-existent keys', () => {
            const result = cacheManager.get('non-existent-key')
            expect(result).toBeNull()
        })

        it('should respect TTL (time to live)', () => {
            // Create cache manager with short TTL
            const shortTtlCache = new CacheManager({ cacheDuration: 100 })
            
            const key = 'ttl-test'
            const value = { data: 'test' }
            
            // Store value
            shortTtlCache.set(key, value)
            
            // Should be available immediately
            let result = shortTtlCache.get(key)
            expect(result).toEqual(value)
            
            // Wait for TTL to expire
            vi.advanceTimersByTime(150)
            
            // Should be expired
            result = shortTtlCache.get(key)
            expect(result).toBeNull()
        })

        it('should clear cache', () => {
            // Store multiple values
            cacheManager.set('key1', { data: 'value1' })
            cacheManager.set('key2', { data: 'value2' })
            
            // Verify they exist
            expect(cacheManager.get('key1')).not.toBeNull()
            expect(cacheManager.get('key2')).not.toBeNull()
            
            // Clear cache
            cacheManager.clear()
            
            // Verify they're gone
            expect(cacheManager.get('key1')).toBeNull()
            expect(cacheManager.get('key2')).toBeNull()
        })
    })

    describe('withCache Helper', () => {
        it('should cache function results', async () => {
            const expensiveFunction = vi.fn().mockResolvedValue({ data: 'expensive-result' })
            
            // Create cached version
            const cachedFunction = cacheManager.withCache(
                expensiveFunction,
                () => 'expensive-function-key'
            )
            
            // First call should execute function
            const result1 = await cachedFunction()
            expect(expensiveFunction).toHaveBeenCalledTimes(1)
            expect(result1).toEqual({ data: 'expensive-result' })
            
            // Second call should use cache
            const result2 = await cachedFunction()
            expect(expensiveFunction).toHaveBeenCalledTimes(1) // Still only called once
            expect(result2).toEqual({ data: 'expensive-result' })
        })

        it('should re-execute function after cache expires', async () => {
            // Create cache manager with short TTL
            const shortTtlCache = new CacheManager({ cacheDuration: 100 })
            
            const expensiveFunction = vi.fn()
                .mockResolvedValueOnce({ data: 'first-result' })
                .mockResolvedValueOnce({ data: 'second-result' })
            
            const cachedFunction = shortTtlCache.withCache(
                expensiveFunction,
                () => 'short-ttl-function'
            )
            
            // First call
            const result1 = await cachedFunction()
            expect(result1).toEqual({ data: 'first-result' })
            expect(expensiveFunction).toHaveBeenCalledTimes(1)
            
            // Wait for cache to expire
            vi.advanceTimersByTime(150)
            
            // Second call should re-execute function
            const result2 = await cachedFunction()
            expect(result2).toEqual({ data: 'second-result' })
            expect(expensiveFunction).toHaveBeenCalledTimes(2)
        })

        it('should handle function arguments in cache key', async () => {
            const functionWithArgs = vi.fn((arg: string) => 
                Promise.resolve({ data: `result-for-${arg}` })
            )
            
            // Create cached version that includes args in key
            const cachedFunction = cacheManager.withCache(
                functionWithArgs,
                (arg: string) => `function-${arg}`
            )
            
            // Call with different arguments
            const result1 = await cachedFunction('arg1')
            const result2 = await cachedFunction('arg2')
            const result3 = await cachedFunction('arg1') // Should use cache
            
            expect(result1).toEqual({ data: 'result-for-arg1' })
            expect(result2).toEqual({ data: 'result-for-arg2' })
            expect(result3).toEqual({ data: 'result-for-arg1' })
            
            // Function should be called twice (once for each unique arg)
            expect(functionWithArgs).toHaveBeenCalledTimes(2)
        })
    })

    describe('Error Handling', () => {
        it('should handle localStorage errors gracefully', () => {
            // Create a cache manager with localStorage disabled
            const errorProneCache = new CacheManager({ enableCache: false })
            
            // Should not throw when setting fails
            expect(() => errorProneCache.set('key', { data: 'value' })).not.toThrow()
            
            // Should return null when cache is disabled
            const result = errorProneCache.get('key')
            expect(result).toBeNull()
        })

        it('should handle corrupted cache data gracefully', () => {
            // Mock console.warn to suppress expected warnings
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
            
            // Store invalid JSON in localStorage before creating cache manager
            localStorageMock.getItem.mockReturnValue('invalid-json-{')
            
            // Create new cache manager to trigger loading
            const corruptedCache = new CacheManager()
            
            // Should return null for any key when data is corrupted
            const result = corruptedCache.get('test-key')
            expect(result).toBeNull()
            
            // Verify warning was logged
            expect(consoleSpy).toHaveBeenCalledWith(
                'Failed to load cache from storage:',
                expect.any(Error)
            )
            
            // Restore console.warn
            consoleSpy.mockRestore()
        })
    })

    describe('Debounced localStorage Writes', () => {
        it('should batch multiple writes within debounce window', () => {
            // Set multiple values rapidly
            cacheManager.set('key1', { data: 'value1' })
            cacheManager.set('key2', { data: 'value2' })
            cacheManager.set('key3', { data: 'value3' })
            
            // localStorage should not have been called yet
            expect(localStorageMock.setItem).not.toHaveBeenCalled()
            
            // Advance timers to trigger debounced save
            vi.advanceTimersByTime(2100) // Past the 2000ms debounce
            
            // Now localStorage should have been called exactly once
            expect(localStorageMock.setItem).toHaveBeenCalledTimes(1)
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                'cache_state',
                expect.stringContaining('key1')
            )
        })

        it('should save immediately on clear()', () => {
            // Set a value first
            cacheManager.set('key', { data: 'value' })
            vi.clearAllMocks() // Clear the mock calls from set()
            
            // Clear should save immediately
            cacheManager.clear()
            
            // localStorage should be called immediately (removeItem for empty cache)
            expect(localStorageMock.removeItem).toHaveBeenCalledWith('cache_state')
            
            // No pending timers should exist
            expect(vi.getTimerCount()).toBe(0)
        })

        it('should save immediately on saveImmediately()', () => {
            // Set a value to create pending write
            cacheManager.set('key', { data: 'value' })
            vi.clearAllMocks()
            
            // Force immediate save
            cacheManager.saveImmediately()
            
            // localStorage should be called immediately
            expect(localStorageMock.setItem).toHaveBeenCalledTimes(1)
            
            // No pending timers should exist
            expect(vi.getTimerCount()).toBe(0)
        })

        it('should cancel previous timeout when new writes arrive', () => {
            // First write
            cacheManager.set('key1', { data: 'value1' })
            
            // Wait partway through debounce period
            vi.advanceTimersByTime(1000)
            
            // Second write should reset the timer
            cacheManager.set('key2', { data: 'value2' })
            
            // Wait the original timeout period (should not save yet)
            vi.advanceTimersByTime(1500)
            expect(localStorageMock.setItem).not.toHaveBeenCalled()
            
            // Wait the full new timeout period
            vi.advanceTimersByTime(1000)
            expect(localStorageMock.setItem).toHaveBeenCalledTimes(1)
        })

        it('should handle multiple cache instances independently', () => {
            // Create second cache manager
            const cacheManager2 = new CacheManager()
            
            // Clear mocks after both instances are created
            vi.clearAllMocks()
            
            // Set values in both
            cacheManager.set('key1', { data: 'value1' })
            cacheManager2.set('key2', { data: 'value2' })
            
            // Advance time for first cache's debounce
            vi.advanceTimersByTime(2100)
            
            // Both localStorage calls should have happened (one for each instance)
            expect(localStorageMock.setItem).toHaveBeenCalledTimes(2)
            
            // All timers should be cleared
            expect(vi.getTimerCount()).toBe(0)
        })
    })

    describe('Cache Size Management', () => {
        it('should enforce entry count limits using LRU eviction', () => {
            // Create cache with small limits for testing
            const smallCache = new CacheManager({ 
                maxEntries: 2,
                maxCacheSize: 1024 * 1024 // 1MB
            })
            
            // Add more entries than the limit
            smallCache.set('key1', { data: 'value1' })
            smallCache.set('key2', { data: 'value2' })
            smallCache.set('key3', { data: 'value3' }) // This should trigger eviction
            
            // Advance timers to trigger debounced cache resolution
            vi.advanceTimersByTime(2100)
            
            // Only the newest 2 entries should remain
            expect(smallCache.get('key1')).toBeNull() // Should be evicted (oldest)
            expect(smallCache.get('key2')).not.toBeNull()
            expect(smallCache.get('key3')).not.toBeNull()
            
            const stats = smallCache.getStats()
            expect(stats.totalEntries).toBe(2)
        })

        it('should update access times for LRU tracking', () => {
            const cache = new CacheManager({ 
                maxEntries: 2,
                maxCacheSize: 1024 * 1024
            })
            
            // Add entries with time separation
            cache.set('key1', { data: 'value1' })
            vi.advanceTimersByTime(100) // T+100
            cache.set('key2', { data: 'value2' })
            vi.advanceTimersByTime(100) // T+200
            
            // Access key1 to update its access time (should be T+200 now)
            cache.get('key1')
            vi.advanceTimersByTime(100) // T+300
            
            // Add a third entry (should evict key2, not key1, since key1 was accessed more recently)
            cache.set('key3', { data: 'value3' })
            
            // Advance timers to trigger debounced cache resolution
            vi.advanceTimersByTime(2100)
            
            expect(cache.get('key1')).not.toBeNull() // Should remain (recently accessed)
            expect(cache.get('key2')).toBeNull() // Should be evicted (not recently accessed)
            expect(cache.get('key3')).not.toBeNull() // Should remain (newest)
        })

        it('should provide cache statistics with size information', () => {
            const cache = new CacheManager()
            
            cache.set('small', 'data')
            cache.set('large', { largeData: 'x'.repeat(1000) })
            
            const stats = cache.getStats()
            
            expect(stats.totalEntries).toBe(2)
            expect(stats.totalSize).toBeGreaterThan(0)
            expect(typeof stats.totalSize).toBe('number')
            expect(stats.cacheHits).toBe(0)
            expect(stats.cacheMisses).toBe(0)
        })

        it('should handle size estimation for different data types', () => {
            const cache = new CacheManager()
            
            // Test different data types
            cache.set('string', 'hello')
            cache.set('number', 42)
            cache.set('object', { name: 'test', value: 123 })
            cache.set('array', [1, 2, 3, 4, 5])
            
            const stats = cache.getStats()
            expect(stats.totalEntries).toBe(4)
            expect(stats.totalSize).toBeGreaterThan(0)
        })

        it('should handle non-serializable data gracefully', () => {
            const cache = new CacheManager()
            
            // Create circular reference (non-serializable)
            const circular: any = { name: 'test' }
            circular.self = circular
            
            // Should not throw and should use fallback size estimation
            expect(() => cache.set('circular', circular)).not.toThrow()
            
            const stats = cache.getStats()
            expect(stats.totalEntries).toBe(1)
            expect(stats.totalSize).toBe(1024) // Fallback size
        })

        it('should evict by size when size limit is exceeded', () => {
            // Create cache with small size limit
            const cache = new CacheManager({
                maxEntries: 100, // High entry limit
                maxCacheSize: 1000 // Small size limit (1KB)
            })
            
            // Add large data entries
            cache.set('large1', 'x'.repeat(500)) // ~500 bytes
            vi.advanceTimersByTime(10)
            cache.set('large2', 'x'.repeat(500)) // ~500 bytes
            vi.advanceTimersByTime(10)
            cache.set('large3', 'x'.repeat(500)) // This should trigger size-based eviction
            
            // Advance timers to trigger debounced cache resolution
            vi.advanceTimersByTime(2100)
            
            // Should evict oldest entries to stay under size limit
            const stats = cache.getStats()
            expect(stats.totalSize).toBeLessThanOrEqual(1000)
            
            // Verify that not all entries remain (some were evicted)
            const remainingEntries = [
                cache.get('large1'),
                cache.get('large2'), 
                cache.get('large3')
            ].filter(entry => entry !== null).length
            
            expect(remainingEntries).toBeLessThan(3)
        })
    })
})
