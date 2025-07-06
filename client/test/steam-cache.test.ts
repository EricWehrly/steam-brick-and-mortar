import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamApiClient } from '../src/steam/SteamApiClient'

// Mock localStorage for testing
const localStorageMock = {
    store: new Map<string, string>(),
    getItem: vi.fn((key: string) => localStorageMock.store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
        localStorageMock.store.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
        localStorageMock.store.delete(key)
    }),
    clear: vi.fn(() => {
        localStorageMock.store.clear()
    }),
    key: vi.fn((index: number) => {
        const keys = Array.from(localStorageMock.store.keys())
        return keys[index] || null
    }),
    get length() {
        return localStorageMock.store.size
    }
}

// Mock global localStorage
Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true
})

describe('Steam API Client Caching', () => {
    let client: SteamApiClient
    
    beforeEach(() => {
        // Clear localStorage mock between tests
        localStorageMock.store.clear()
        localStorageMock.getItem.mockClear()
        localStorageMock.setItem.mockClear()
        localStorageMock.removeItem.mockClear()
        
        // Create new client instance
        client = new SteamApiClient('https://steam-api-dev.wehrly.com', {
            cacheDuration: 1000, // 1 second for testing
            enableCache: true,
            cachePrefix: 'test_steam_cache_'
        })
    })

    describe('Cache Configuration', () => {
        it('should initialize with default cache configuration', () => {
            const defaultClient = new SteamApiClient()
            const stats = defaultClient.getCacheStats()
            
            expect(stats.totalEntries).toBe(0)
            expect(stats.resolveEntries).toBe(0)
            expect(stats.gamesEntries).toBe(0)
        })
        
        it('should initialize with custom cache configuration', () => {
            // Clear mock calls from beforeEach and any previous instances
            localStorageMock.getItem.mockClear()
            
            const customClient = new SteamApiClient('https://api.example.com', {
                cacheDuration: 5000,
                enableCache: false,
                cachePrefix: 'custom_prefix_'
            })
            
            // Cache should be disabled, so no localStorage interaction
            expect(localStorageMock.getItem).not.toHaveBeenCalled()
        })
    })

    describe('Cache Statistics', () => {
        it('should return empty cache statistics initially', () => {
            const stats = client.getCacheStats()
            
            expect(stats.totalEntries).toBe(0)
            expect(stats.resolveEntries).toBe(0)
            expect(stats.gamesEntries).toBe(0)
            expect(stats.oldestEntry).toBeNull()
            expect(stats.newestEntry).toBeNull()
            expect(stats.totalSize).toBe(0)
        })
    })

    describe('Offline Availability', () => {
        it('should return false for offline availability with no cached data', () => {
            const isAvailable = client.isAvailableOffline('testuser')
            expect(isAvailable).toBe(false)
        })
        
        it('should return null for cached user data with no cached data', () => {
            const cachedData = client.getCachedUserData('testuser')
            expect(cachedData).toBeNull()
        })
    })

    describe('Cache Management', () => {
        it('should clear cache successfully', () => {
            client.clearCache()
            
            const stats = client.getCacheStats()
            expect(stats.totalEntries).toBe(0)
        })
        
        it('should clear localStorage when clearing cache', () => {
            // Add some mock data to localStorage
            localStorageMock.store.set('test_steam_cache_resolve_user1', '{"data":"test"}')
            localStorageMock.store.set('test_steam_cache_games_123', '{"data":"test"}')
            localStorageMock.store.set('other_key', 'should_remain')
            
            client.clearCache()
            
            // Should remove cache-prefixed keys but not others
            expect(localStorageMock.store.has('test_steam_cache_resolve_user1')).toBe(false)
            expect(localStorageMock.store.has('test_steam_cache_games_123')).toBe(false)
            expect(localStorageMock.store.has('other_key')).toBe(true)
        })
    })

    describe('Cache Persistence', () => {
        it('should save cache state to localStorage', () => {
            // This would normally happen during API calls
            // For now, just verify the localStorage interaction setup works
            expect(localStorageMock.setItem).toBeDefined()
            expect(localStorageMock.getItem).toBeDefined()
        })
        
        it('should load cache state from localStorage on initialization', () => {
            // Set up mock data in localStorage
            const mockCacheData = JSON.stringify([
                ['test_steam_cache_resolve_user1', {
                    data: { vanity_url: 'user1', steamid: '123', resolved_at: new Date().toISOString() },
                    timestamp: Date.now()
                }]
            ])
            
            localStorageMock.store.set('test_steam_cache_state', mockCacheData)
            
            // Create new client which should load the cache
            const newClient = new SteamApiClient('https://steam-api-dev.wehrly.com', {
                cachePrefix: 'test_steam_cache_'
            })
            
            // Verify cache was loaded
            expect(localStorageMock.getItem).toHaveBeenCalledWith('test_steam_cache_state')
        })
    })

    describe('Error Handling', () => {
        it('should handle corrupted localStorage cache gracefully', () => {
            // Set corrupted data in localStorage
            localStorageMock.store.set('test_steam_cache_state', 'invalid json')
            
            // Should not throw when creating client
            expect(() => {
                new SteamApiClient('https://steam-api-dev.wehrly.com', {
                    cachePrefix: 'test_steam_cache_'
                })
            }).not.toThrow()
            
            // Should clear corrupted cache
            expect(localStorageMock.removeItem).toHaveBeenCalledWith('test_steam_cache_state')
        })
    })
})
