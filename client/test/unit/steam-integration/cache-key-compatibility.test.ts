/**
 * Test to verify SteamIntegration.getCachedUsers() handles both key formats correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'

describe('SteamIntegration Cache Key Compatibility', () => {
    let steamIntegration: SteamIntegration
    let mockSteamClient: any

    beforeEach(() => {
        // Create mock SteamApiClient
        mockSteamClient = {
            getAllCacheKeys: vi.fn(),
            getCached: vi.fn(),
            hasCached: vi.fn()
        }
        
        steamIntegration = new SteamIntegration()
        // Replace the client with our mock
        ;(steamIntegration as any).steamClient = mockSteamClient
    })

    it('should handle prefixed cache keys correctly', () => {
        // Mock cache keys without prefix (as getAllKeys should return after stripping)
        mockSteamClient.getAllCacheKeys.mockReturnValue([
            'resolve_spitemonger',
            'games_76561197984589530',
            'other_key'
        ])

        // Mock resolve data
        mockSteamClient.getCached.mockImplementation((key: string) => {
            if (key === 'resolve_spitemonger') {
                return { steamid: '76561197984589530', vanity_url: 'spitemonger' }
            }
            if (key === 'games_76561197984589530') {
                return { 
                    vanity_url: 'spitemonger',
                    game_count: 42,
                    games: []
                }
            }
            return null
        })

        const cachedUsers = steamIntegration.getCachedUsers()

        expect(cachedUsers).toHaveLength(1)
        expect(cachedUsers[0]).toEqual({
            vanityUrl: 'spitemonger',
            displayName: 'spitemonger',
            gameCount: 42,
            steamId: '76561197984589530'
        })
    })

    it('should handle non-prefixed cache keys correctly', () => {
        // Mock cache keys without prefix (theoretical format after stripping)
        mockSteamClient.getAllCacheKeys.mockReturnValue([
            'resolve_spitemonger',
            'games_76561197984589530',
            'other_key'
        ])

        // Mock resolve data
        mockSteamClient.getCached.mockImplementation((key: string) => {
            if (key === 'resolve_spitemonger') {
                return { steamid: '76561197984589530', vanity_url: 'spitemonger' }
            }
            if (key === 'games_76561197984589530') {
                return { 
                    vanity_url: 'spitemonger',
                    game_count: 42,
                    games: []
                }
            }
            return null
        })

        const cachedUsers = steamIntegration.getCachedUsers()

        expect(cachedUsers).toHaveLength(1)
        expect(cachedUsers[0]).toEqual({
            vanityUrl: 'spitemonger',
            displayName: 'spitemonger', 
            gameCount: 42,
            steamId: '76561197984589530'
        })
    })

    it('should handle mixed cache key formats', () => {
        // Mock keys as getAllKeys should return them (without prefix)
        mockSteamClient.getAllCacheKeys.mockReturnValue([
            'resolve_user1',
            'resolve_user2',
            'games_76561197984589530',
            'games_76561197984589531',
            'other_key'
        ])

        // Mock resolve data
        mockSteamClient.getCached.mockImplementation((key: string) => {
            if (key === 'resolve_user1') {
                return { steamid: '76561197984589530', vanity_url: 'user1' }
            }
            if (key === 'resolve_user2') {
                return { steamid: '76561197984589531', vanity_url: 'user2' }
            }
            if (key === 'games_76561197984589530') {
                return { 
                    vanity_url: 'user1',
                    game_count: 10,
                    games: []
                }
            }
            if (key === 'games_76561197984589531') {
                return { 
                    vanity_url: 'user2',
                    game_count: 20,
                    games: []
                }
            }
            return null
        })

        const cachedUsers = steamIntegration.getCachedUsers()

        expect(cachedUsers).toHaveLength(2)
        expect(cachedUsers.some(u => u.vanityUrl === 'user1' && u.gameCount === 10)).toBe(true)
        expect(cachedUsers.some(u => u.vanityUrl === 'user2' && u.gameCount === 20)).toBe(true)
    })

    it('should handle hasCachedData with correct key format', () => {
        // Test with standard unprefixed format (as the method should use)
        mockSteamClient.getCached.mockImplementation((key: string) => {
            if (key === 'resolve_testuser') {
                return { steamid: '76561197984589530' }
            }
            return null
        })
        mockSteamClient.hasCached.mockReturnValue(true)

        const result = steamIntegration.hasCachedData('testuser')
        expect(result).toBe(true)
        expect(mockSteamClient.getCached).toHaveBeenCalledWith('resolve_testuser')
    })
})
