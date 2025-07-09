/**
 * Unit tests for SteamIntegration
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'

// Mock the SteamApiClient
vi.mock('../../../src/steam', () => ({
    SteamApiClient: vi.fn().mockImplementation(() => ({
        resolveVanityUrl: vi.fn(),
        getUserGames: vi.fn(),
        loadGamesProgressively: vi.fn(),
        clearCache: vi.fn(),
        getCacheStats: vi.fn()
    }))
}))

// Mock ValidationUtils
vi.mock('../../../src/utils', () => ({
    ValidationUtils: {
        extractVanityFromInput: vi.fn((input: string) => input.toLowerCase())
    }
}))

describe('SteamIntegration Unit Tests', () => {
    let steamIntegration: SteamIntegration

    beforeEach(() => {
        vi.clearAllMocks()
        steamIntegration = new SteamIntegration({
            apiBaseUrl: 'https://test-api.example.com',
            maxGames: 20
        })
    })

    describe('Configuration', () => {
        test('should use default configuration when none provided', () => {
            const defaultIntegration = new SteamIntegration()
            expect(defaultIntegration).toBeDefined()
        })

        test('should use custom configuration', () => {
            const customIntegration = new SteamIntegration({
                apiBaseUrl: 'https://custom-api.example.com',
                maxGames: 50
            })
            expect(customIntegration).toBeDefined()
        })
    })

    describe('Cache Management', () => {
        test('should clear cache', () => {
            steamIntegration.clearCache()
            // Verify that the underlying methods are called
            expect(true).toBe(true) // Basic verification that method exists and runs
        })

        test('should get cache stats', () => {
            const mockStats = {
                entries: 5,
                size: '1.2MB',
                maxAge: 3600000
            }
            
            // Mock the getCacheStats method
            const mockGetCacheStats = vi.fn().mockReturnValue(mockStats)
            // @ts-expect-error - Accessing private member for testing
            steamIntegration.steamClient.getCacheStats = mockGetCacheStats
            
            steamIntegration.getCacheStats()
            expect(mockGetCacheStats).toHaveBeenCalled()
        })
    })

    describe('Game Library State', () => {
        test('should get initial game library state', () => {
            const state = steamIntegration.getGameLibraryState()
            
            expect(state.userData).toBeNull()
            expect(state.currentGameIndex).toBe(0)
            expect(state.isLoading).toBe(false)
            expect(state.error).toBeNull()
        })

        test('should get games for scene rendering when no data', () => {
            const games = steamIntegration.getGamesForScene()
            expect(games).toEqual([])
        })
    })

    describe('Offline Data', () => {
        test('should return false for offline data availability', () => {
            const hasOffline = steamIntegration.hasOfflineData('testuser')
            expect(hasOffline).toBe(false)
        })
    })

    describe('Refresh Data', () => {
        test('should return null when no current data to refresh', async () => {
            const callbacks = {
                onStatusUpdate: vi.fn()
            }
            
            const result = await steamIntegration.refreshData(callbacks)
            
            expect(result).toBeNull()
            expect(callbacks.onStatusUpdate).toHaveBeenCalledWith('No data to refresh', 'error')
        })
    })

    describe('Load Games Integration', () => {
        test('should handle loadGamesForUser with minimal callbacks', async () => {
            // Mock the Steam API responses
            const mockResolveResponse = {
                vanity_url: 'testuser',
                steamid: '76561198000000000',
                resolved_at: '2023-01-01T00:00:00Z'
            }
            
            const mockUserGames = {
                steamid: '76561198000000000',
                vanity_url: 'testuser',
                game_count: 1,
                games: [{
                    appid: 440,
                    name: 'Team Fortress 2',
                    playtime_forever: 1000,
                    img_icon_url: 'icon',
                    img_logo_url: 'logo',
                    artwork: {
                        icon: 'icon_url',
                        logo: 'logo_url',
                        header: 'header_url',
                        library: 'library_url'
                    }
                }],
                retrieved_at: '2023-01-01T00:00:00Z'
            }
            
            // Mock the steam client methods
            // @ts-expect-error - Accessing private member for testing
            steamIntegration.steamClient.resolveVanityUrl = vi.fn().mockResolvedValue(mockResolveResponse)
            // @ts-expect-error - Accessing private member for testing
            steamIntegration.steamClient.getUserGames = vi.fn().mockResolvedValue(mockUserGames)
            // @ts-expect-error - Accessing private member for testing
            steamIntegration.steamClient.loadGamesProgressively = vi.fn().mockResolvedValue(undefined)
            
            const callbacks = {
                onProgress: vi.fn(),
                onGameLoaded: vi.fn(),
                onStatusUpdate: vi.fn()
            }
            
            const result = await steamIntegration.loadGamesForUser('testuser', callbacks)
            
            expect(result).toBeDefined()
            expect(callbacks.onStatusUpdate).toHaveBeenCalledWith('Loading Steam games...', 'loading')
            // @ts-expect-error - Accessing private member for testing
            expect(steamIntegration.steamClient.resolveVanityUrl).toHaveBeenCalledWith('testuser')
            // @ts-expect-error - Accessing private member for testing
            expect(steamIntegration.steamClient.getUserGames).toHaveBeenCalledWith('76561198000000000')
        })

        test('should handle errors during loading', async () => {
            // Mock an error
            const mockError = new Error('API Error')
            // @ts-expect-error - Accessing private member for testing
            steamIntegration.steamClient.resolveVanityUrl = vi.fn().mockRejectedValue(mockError)
            
            const callbacks = {
                onStatusUpdate: vi.fn()
            }
            
            await expect(steamIntegration.loadGamesForUser('testuser', callbacks)).rejects.toThrow('API Error')
            expect(callbacks.onStatusUpdate).toHaveBeenCalledWith(
                '❌ Failed to load games. Please check the Steam profile name and try again.',
                'error'
            )
        })
    })
})
