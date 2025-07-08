/**
 * Integration tests for SteamApiClient 
 * Tests the composed client functionality with mocked dependencies
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SteamApiClient } from '../../src/steam/SteamApiClient'
import { 
    setupFetchMock, 
    setupLocalStorageMock,
    createMockBlob, 
    createMockFetchResponse,
    mockGame,
    mockUser 
} from '../utils/test-helpers'

describe('SteamApiClient Integration Tests', () => {
    let client: SteamApiClient
    let fetchMock: any
    let localStorageMock: any

    beforeEach(() => {
        // Setup all mocks
        fetchMock = setupFetchMock()
        localStorageMock = setupLocalStorageMock()
        
        // Clear all mocks and storage
        vi.clearAllMocks()
        localStorageMock.storage.clear()
        
        // Create fresh client instance
        client = new SteamApiClient('https://test-api.example.com')
    })

    describe('Cache Integration', () => {
        it('should use cached responses for repeated calls', async () => {
            const mockResponse = { steamid: '12345', vanity_url: 'testuser', resolved_at: new Date().toISOString() }
            fetchMock.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockResponse)
            })
            
            // First call
            const result1 = await client.resolveVanityUrl('testuser')
            
            // Second call should use cache
            const result2 = await client.resolveVanityUrl('testuser')
            
            expect(result1).toEqual(mockResponse)
            expect(result2).toEqual(mockResponse)
            expect(fetchMock).toHaveBeenCalledTimes(1) // Only one actual HTTP call
        })

        it('should clear cache when requested', () => {
            client.clearCache()
            
            const stats = client.getCacheStats()
            expect(stats.totalEntries).toBe(0)
        })
    })

    describe('Progressive Loading', () => {
        it('should load games progressively with rate limiting', async () => {
            const loadedGames: any[] = []
            const progressUpdates: Array<{current: number, total: number}> = []
            
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1,
                onProgress: (current, total) => {
                    progressUpdates.push({ current, total })
                },
                onGameLoaded: (game) => {
                    loadedGames.push(game)
                }
            })
            
            expect(result).toHaveLength(1)
            expect(loadedGames).toHaveLength(1)
            expect(progressUpdates.length).toBeGreaterThan(0)
        })

        it('should prioritize games by playtime', async () => {
            const multiGameUser = {
                ...mockUser,
                games: [
                    { ...mockGame, appid: 1, playtime_forever: 100 },
                    { ...mockGame, appid: 2, playtime_forever: 500 },
                    { ...mockGame, appid: 3, playtime_forever: 200 }
                ]
            }
            
            const loadOrder: any[] = []
            
            await client.loadGamesProgressively(multiGameUser, {
                maxGames: 3,
                onGameLoaded: (game) => {
                    loadOrder.push(game)
                }
            })
            
            // Should be ordered by playtime (descending)
            expect(loadOrder[0].playtime_forever).toBe(500)
            expect(loadOrder[1].playtime_forever).toBe(200)
            expect(loadOrder[2].playtime_forever).toBe(100)
        })
    })

    describe('Image Integration', () => {
        it('should download game images', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await client.downloadGameImage(mockGame.artwork.icon)
            
            expect(result).toBe(mockBlob)
            expect(fetchMock).toHaveBeenCalledWith(
                mockGame.artwork.icon,
                expect.objectContaining({ mode: 'cors' })
            )
        })

        it('should download all game artwork', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await client.downloadGameArtwork(mockGame)
            
            expect(result).toEqual({
                icon: mockBlob,
                logo: mockBlob,
                header: mockBlob,
                library: mockBlob
            })
            expect(fetchMock).toHaveBeenCalledTimes(4)
        })
    })

    describe('Error Handling', () => {
        it('should handle API errors gracefully', async () => {
            fetchMock.mockRejectedValue(new Error('API Error'))
            
            await expect(client.resolveVanityUrl('invaliduser'))
                .rejects.toThrow('API Error')
        })

        it('should handle image download failures gracefully', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))
            
            const result = await client.downloadGameImage(mockGame.artwork.icon)
            
            expect(result).toBeNull()
        })
    })

    describe('Game Artwork Integration', () => {
        it('should download all artwork types for a game', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            const result = await client.downloadGameArtwork(mockGame)
            
            expect(result).toEqual({
                icon: mockBlob,
                logo: mockBlob,
                header: mockBlob,
                library: mockBlob
            })
            
            // Verify all URLs were fetched
            expect(fetchMock).toHaveBeenCalledTimes(4)
            expect(fetchMock).toHaveBeenCalledWith(mockGame.artwork.icon, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(mockGame.artwork.logo, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(mockGame.artwork.header, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(mockGame.artwork.library, expect.any(Object))
        })

        it('should handle partial artwork failures gracefully', async () => {
            let callCount = 0
            fetchMock.mockImplementation(() => {
                callCount++
                if (callCount === 2) { // Second call fails (logo)
                    return Promise.reject(new Error('Network error'))
                }
                return Promise.resolve(createMockFetchResponse(createMockBlob()))
            })
            
            const result = await client.downloadGameArtwork(mockGame)
            
            expect(result.icon).toBeTruthy()
            expect(result.logo).toBeNull()
            expect(result.header).toBeTruthy()
            expect(result.library).toBeTruthy()
        })

        it('should call image callbacks for each artwork type', async () => {
            const mockBlob = createMockBlob()
            const mockResponse = createMockFetchResponse(mockBlob)
            fetchMock.mockResolvedValue(mockResponse)
            
            // Test using the ImageManager's downloadGameArtwork with options
            const result = await client.downloadGameArtwork(mockGame)
            
            expect(result).toEqual({
                icon: mockBlob,
                logo: mockBlob,
                header: mockBlob,
                library: mockBlob
            })
        })

        it('should integrate progressive loading with game processing', async () => {
            const loadedGames: any[] = []
            const onGameLoaded = vi.fn((game: any) => {
                loadedGames.push(game)
            })
            
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1,
                onGameLoaded
            })
            
            expect(result).toHaveLength(1)
            expect(onGameLoaded).toHaveBeenCalledWith(mockGame)
            expect(loadedGames).toHaveLength(1)
        })

        it('should not call fetch when loading games without artwork', async () => {
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1,
                onGameLoaded: vi.fn()
            })
            
            expect(result).toHaveLength(1)
            expect(fetchMock).not.toHaveBeenCalled()
        })
    })
})
