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
})
