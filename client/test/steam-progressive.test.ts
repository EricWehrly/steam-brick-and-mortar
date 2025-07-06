/**
 * Tests for Progressive Steam Game Loading
 * 
 * Tests the rate-limited progressive loading functionality
 * with smart caching and duplicate prevention.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamApiClient, type SteamUser, type SteamGame } from '../src/steam/SteamApiClient'

// Mock fetch for testing
;(globalThis as any).fetch = vi.fn()

// Mock localStorage
const localStorageMock = {
    storage: new Map<string, string>(),
    getItem: vi.fn((key: string) => localStorageMock.storage.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
        localStorageMock.storage.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
        localStorageMock.storage.delete(key)
    }),
    clear: vi.fn(() => {
        localStorageMock.storage.clear()
    }),
    get length() {
        return localStorageMock.storage.size
    },
    key: vi.fn((index: number) => {
        const keys = Array.from(localStorageMock.storage.keys())
        return keys[index] || null
    })
}

Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true
})

// Mock setTimeout for rate limiting tests
vi.mock('timers', () => ({
    setTimeout: vi.fn((callback: () => void, ms: number) => {
        // For testing, execute immediately but track the delay
        callback()
        return 1
    })
}))

describe('Steam Progressive Loading', () => {
    let client: SteamApiClient
    let mockUserData: SteamUser

    beforeEach(() => {
        // Clear all mocks and storage
        vi.clearAllMocks()
        localStorageMock.storage.clear()
        
        // Create fresh client instance
        client = new SteamApiClient('https://test-api.example.com')
        
        // Mock user data with multiple games
        mockUserData = {
            steamid: '76561197984589530',
            vanity_url: 'testuser',
            game_count: 5,
            retrieved_at: new Date().toISOString(),
            games: [
                {
                    appid: 220,
                    name: 'Half-Life 2',
                    playtime_forever: 1200,
                    img_icon_url: 'icon1',
                    img_logo_url: 'logo1',
                    artwork: {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                },
                {
                    appid: 730,
                    name: 'Counter-Strike 2',
                    playtime_forever: 800,
                    img_icon_url: 'icon2',
                    img_logo_url: 'logo2',
                    artwork: {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                },
                {
                    appid: 570,
                    name: 'Dota 2',
                    playtime_forever: 300,
                    img_icon_url: 'icon3',
                    img_logo_url: 'logo3',
                    artwork: {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                },
                {
                    appid: 440,
                    name: 'Team Fortress 2',
                    playtime_forever: 150,
                    img_icon_url: 'icon4',
                    img_logo_url: 'logo4',
                    artwork: {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                },
                {
                    appid: 271590,
                    name: 'Grand Theft Auto V',
                    playtime_forever: 0, // Unplayed game
                    img_icon_url: 'icon5',
                    img_logo_url: 'logo5',
                    artwork: {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                }
            ]
        }
    })

    describe('Progressive Loading Core', () => {
        it('should load games progressively with rate limiting', async () => {
            // Track timing for rate limiting verification
            const startTime = Date.now()
            const loadedGames: SteamGame[] = []
            
            const progressUpdates: Array<{current: number, total: number}> = []
            
            const options = {
                maxRequestsPerSecond: 4,
                skipCached: false,
                prioritizeByPlaytime: true,
                onProgress: (current: number, total: number) => {
                    progressUpdates.push({ current, total })
                },
                onGameLoaded: (game: SteamGame) => {
                    loadedGames.push(game)
                }
            }
            
            const result = await client.loadGamesProgressively(mockUserData, options)
            
            // Verify all games were processed
            expect(result).toHaveLength(mockUserData.games.length)
            expect(loadedGames).toHaveLength(mockUserData.games.length)
            
            // Verify progress updates
            expect(progressUpdates.length).toBeGreaterThan(0)
            expect(progressUpdates[progressUpdates.length - 1].current).toBe(mockUserData.games.length)
        })

        it('should prioritize games by playtime', async () => {
            const loadOrder: SteamGame[] = []
            
            const options = {
                maxRequestsPerSecond: 10, // Fast for testing
                skipCached: false,
                prioritizeByPlaytime: true,
                onGameLoaded: (game: SteamGame) => {
                    loadOrder.push(game)
                }
            }
            
            await client.loadGamesProgressively(mockUserData, options)
            
            // Verify games are ordered by playtime (descending)
            expect(loadOrder[0].name).toBe('Half-Life 2') // 1200 minutes
            expect(loadOrder[1].name).toBe('Counter-Strike 2') // 800 minutes
            expect(loadOrder[2].name).toBe('Dota 2') // 300 minutes
            expect(loadOrder[3].name).toBe('Team Fortress 2') // 150 minutes
            expect(loadOrder[4].name).toBe('Grand Theft Auto V') // 0 minutes
        })

        it('should skip cached games when requested', async () => {
            // Pre-cache one game
            const gameToCache = mockUserData.games[0]
            const enhancedGame = {
                ...gameToCache,
                artwork: {
                    icon: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${gameToCache.appid}/${gameToCache.img_icon_url}.jpg`,
                    logo: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${gameToCache.appid}/${gameToCache.img_logo_url}.jpg`,
                    header: `https://cdn.akamai.steamstatic.com/steam/apps/${gameToCache.appid}/header.jpg`,
                    library: `https://cdn.akamai.steamstatic.com/steam/apps/${gameToCache.appid}/library_600x900.jpg`
                }
            }
            
            // Manually cache the first game
            const cacheKey = `steam_api_cache_game_details_${gameToCache.appid}`
            const cacheEntry = {
                data: enhancedGame,
                timestamp: Date.now()
            }
            localStorageMock.setItem(cacheKey, JSON.stringify(cacheEntry))
            
            // Also store cache state for localStorage loading
            const cacheState = JSON.stringify([[cacheKey, cacheEntry]])
            localStorageMock.setItem('steam_api_cache_state', cacheState)
            
            // Reload client to pick up cached data
            client = new SteamApiClient('https://test-api.example.com')
            
            const processedGames: SteamGame[] = []
            
            const options = {
                maxRequestsPerSecond: 10,
                skipCached: true, // Skip cached games
                prioritizeByPlaytime: true,
                onGameLoaded: (game: SteamGame) => {
                    processedGames.push(game)
                }
            }
            
            await client.loadGamesProgressively(mockUserData, options)
            
            // Should process 4 games (5 total - 1 cached)
            expect(processedGames).toHaveLength(4)
            
            // The cached game should not be in the processed list
            const processedAppIds = processedGames.map(g => g.appid)
            expect(processedAppIds).not.toContain(gameToCache.appid)
        })
    })

    describe('Rate Limiting', () => {
        it('should respect rate limiting configuration', async () => {
            const requestTimes: number[] = []
            
            // Override the enforceRateLimit method to track timing
            const originalEnforceRateLimit = (client as any).enforceRateLimit.bind(client)
            ;(client as any).enforceRateLimit = async (requestsPerSecond: number) => {
                requestTimes.push(Date.now())
                return originalEnforceRateLimit(requestsPerSecond)
            }
            
            const options = {
                maxRequestsPerSecond: 2, // 2 requests per second = 500ms interval
                skipCached: false,
                prioritizeByPlaytime: false
            }
            
            await client.loadGamesProgressively(mockUserData, options)
            
            // Verify rate limiting was called
            expect(requestTimes.length).toBe(mockUserData.games.length)
        })
    })

    describe('Cache Integration', () => {
        it('should cache enhanced game details', async () => {
            const options = {
                maxRequestsPerSecond: 10,
                skipCached: false,
                prioritizeByPlaytime: false
            }
            
            await client.loadGamesProgressively(mockUserData, options)
            
            // Verify games were cached
            for (const game of mockUserData.games) {
                const cached = (client as any).getFromCache(`game_details_${game.appid}`)
                expect(cached).toBeTruthy()
                expect(cached.artwork).toBeDefined()
                expect(cached.artwork.icon).toContain('steamcdn-a.akamaihd.net')
            }
        })
        
        it('should use cached data for offline availability', async () => {
            // First load to populate cache
            await client.loadGamesProgressively(mockUserData, {
                maxRequestsPerSecond: 10,
                skipCached: false
            })
            
            // Verify cache contains game details
            const stats = client.getCacheStats()
            expect(stats.totalEntries).toBeGreaterThan(0)
            
            // Test getting cached data
            const firstGame = mockUserData.games[0]
            const cached = (client as any).getFromCache(`game_details_${firstGame.appid}`)
            expect(cached).toBeTruthy()
            expect(cached.name).toBe(firstGame.name)
        })
    })

    describe('Error Handling', () => {
        it('should handle individual game loading errors gracefully', async () => {
            // Mock getGameDetails to fail for specific games
            const originalGetGameDetails = client.getGameDetails.bind(client)
            client.getGameDetails = vi.fn(async (game: SteamGame) => {
                if (game.appid === 730) { // Counter-Strike 2
                    throw new Error('Simulated API error')
                }
                return originalGetGameDetails(game)
            })
            
            const loadedGames: SteamGame[] = []
            const options = {
                maxRequestsPerSecond: 10,
                skipCached: false,
                onGameLoaded: (game: SteamGame) => {
                    loadedGames.push(game)
                }
            }
            
            // Should not throw and should load other games
            await expect(client.loadGamesProgressively(mockUserData, options)).resolves.not.toThrow()
            
            // Should have loaded games despite one failure
            expect(loadedGames.length).toBeGreaterThan(0)
        })
    })

    describe('Utility Methods', () => {
        it('should prioritize games correctly', () => {
            const prioritized = client.getPrioritizedGames(mockUserData)
            
            expect(prioritized[0].name).toBe('Half-Life 2')
            expect(prioritized[1].name).toBe('Counter-Strike 2') 
            expect(prioritized[4].name).toBe('Grand Theft Auto V')
        })
        
        it('should limit prioritized games when requested', () => {
            const prioritized = client.getPrioritizedGames(mockUserData, 3)
            
            expect(prioritized).toHaveLength(3)
            expect(prioritized[0].name).toBe('Half-Life 2')
            expect(prioritized[2].name).toBe('Dota 2')
        })
    })
})
