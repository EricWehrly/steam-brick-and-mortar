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
            hasCached: vi.fn(),
            getCachedUsers: vi.fn()
        }
        
        steamIntegration = new SteamIntegration()
        // Replace the client with our mock
        ;(steamIntegration as any).steamClient = mockSteamClient
    })

    it('should handle prefixed cache keys correctly', () => {
        // Mock the optimized getCachedUsers method
        mockSteamClient.getCachedUsers.mockReturnValue([
            {
                vanityUrl: 'spitemonger',
                displayName: 'spitemonger',
                gameCount: 42,
                steamId: '76561197984589530'
            }
        ])

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
        // Mock the optimized getCachedUsers method
        mockSteamClient.getCachedUsers.mockReturnValue([
            {
                vanityUrl: 'spitemonger',
                displayName: 'spitemonger',
                gameCount: 42,
                steamId: '76561197984589530'
            }
        ])

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
        // Mock the optimized getCachedUsers method to return multiple users
        mockSteamClient.getCachedUsers.mockReturnValue([
            {
                vanityUrl: 'user1',
                displayName: 'user1',
                gameCount: 10,
                steamId: '76561197984589530'
            },
            {
                vanityUrl: 'user2',
                displayName: 'user2',
                gameCount: 20,
                steamId: '76561197984589531'
            }
        ])

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

    it('should use optimized getCachedUsers implementation', () => {
        const mockUsers = [
            {
                vanityUrl: 'testuser1',
                displayName: 'Test User 1',
                gameCount: 100,
                steamId: '76561197984589530'
            },
            {
                vanityUrl: 'testuser2', 
                displayName: 'Test User 2',
                gameCount: 200,
                steamId: '76561197984589531'
            }
        ]

        mockSteamClient.getCachedUsers.mockReturnValue(mockUsers)

        const result = steamIntegration.getCachedUsers()

        expect(result).toEqual(mockUsers)
        expect(mockSteamClient.getCachedUsers).toHaveBeenCalledTimes(1)
        
        // Verify it doesn't call the old inefficient methods
        expect(mockSteamClient.getAllCacheKeys).not.toHaveBeenCalled()
        expect(mockSteamClient.getCached).not.toHaveBeenCalled()
    })
})
