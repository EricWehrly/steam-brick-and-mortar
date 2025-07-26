/**
 * Integration tests for image downloading during progressive loading
 * Tests the full workflow from game loading to image caching
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SteamApiClient } from '../../src/steam/SteamApiClient'
import { setupIndexedDBMock } from '../mocks/indexeddb.mock'
import { 
    setupFetchMock, 
    createMockBlob, 
    createMockFetchResponse,
    mockGame 
} from '../utils/test-helpers'

describe('Image Progressive Loading Integration Tests', () => {
    let steamClient: SteamApiClient
    let fetchMock: any

    beforeEach(() => {
        // Setup mocks
        setupIndexedDBMock()
        fetchMock = setupFetchMock()
        
        // Clear all mocks
        vi.clearAllMocks()
        
        // Create fresh Steam client
        steamClient = new SteamApiClient('https://test-api.example.com')
    })

    afterEach(() => {
        vi.clearAllTimers()
    })

    describe('Progressive Loading with Images', () => {
        it('should download game artwork during progressive loading', async () => {
            // Setup fetch mock for game data API calls
            const mockGameResponse = {
                ...mockGame,
                artwork: {
                    icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/icon.jpg',
                    logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/logo.jpg',
                    header: 'https://cdn.akamai.steamstatic.com/steam/apps/123/header.jpg',
                    library: 'https://cdn.akamai.steamstatic.com/steam/apps/123/library_600x900.jpg'
                }
            }

            const mockUserData = {
                steamid: '123',
                vanity_url: 'testuser',
                game_count: 1,
                games: [mockGameResponse],
                retrieved_at: new Date().toISOString()
            }

            // Setup fetch responses - API call to get user games
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(mockUserData)
            })

            const gameLoadedCallback = vi.fn()
            const progressCallback = vi.fn()

            // Load games progressively
            const userGames = await steamClient.getUserGames('123')
            
            await steamClient.loadGamesProgressively(userGames, {
                maxGames: 1,
                onGameLoaded: gameLoadedCallback,
                onProgress: progressCallback
            })

            // Verify game loading callback was called
            expect(gameLoadedCallback).toHaveBeenCalledWith(
                expect.objectContaining({
                    appid: mockGame.appid,
                    name: mockGame.name,
                    artwork: expect.objectContaining({
                        icon: expect.stringContaining('steamcdn'),
                        logo: expect.stringContaining('steamcdn'),
                        header: expect.stringContaining('cdn.akamai'),
                        library: expect.stringContaining('cdn.akamai')
                    })
                })
            )

            // Verify progress callback was called
            expect(progressCallback).toHaveBeenCalled()
        })

        it('should download game artwork directly via Steam client', async () => {
            const mockImageBlob = createMockBlob()
            const mockImageResponse = createMockFetchResponse(mockImageBlob)
            fetchMock.mockResolvedValue(mockImageResponse)

            const gameWithArtwork = {
                ...mockGame,
                artwork: {
                    icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/icon.jpg',
                    logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/logo.jpg',
                    header: 'https://cdn.akamai.steamstatic.com/steam/apps/123/header.jpg',
                    library: 'https://cdn.akamai.steamstatic.com/steam/apps/123/library_600x900.jpg'
                }
            }

            const artworkBlobs = await steamClient.downloadGameArtwork(gameWithArtwork)

            expect(artworkBlobs).toEqual({
                icon: mockImageBlob,
                logo: mockImageBlob,
                header: mockImageBlob,
                library: mockImageBlob
            })

            // Verify all 4 artwork URLs were fetched
            expect(fetchMock).toHaveBeenCalledTimes(4)
            expect(fetchMock).toHaveBeenCalledWith(gameWithArtwork.artwork.icon, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(gameWithArtwork.artwork.logo, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(gameWithArtwork.artwork.header, expect.any(Object))
            expect(fetchMock).toHaveBeenCalledWith(gameWithArtwork.artwork.library, expect.any(Object))
        })

        it('should handle image download failures gracefully', async () => {
            let callCount = 0
            fetchMock.mockImplementation(() => {
                callCount++
                if (callCount <= 2) {
                    // First two calls succeed (resolve vanity URL, get user games)
                    if (callCount === 1) {
                        return Promise.resolve({
                            ok: true,
                            json: () => Promise.resolve({ steamid: '123', vanity_url: 'testuser', resolved_at: new Date().toISOString() })
                        })
                    }
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ 
                            steamid: '123',
                            vanity_url: 'testuser',
                            game_count: 1,
                            games: [mockGame],
                            retrieved_at: new Date().toISOString()
                        })
                    })
                }
                // Subsequent calls (image downloads) fail
                return Promise.reject(new Error('Image download failed'))
            })

            const gameWithArtwork = {
                ...mockGame,
                artwork: {
                    icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/icon.jpg',
                    logo: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/logo.jpg',
                    header: 'https://cdn.akamai.steamstatic.com/steam/apps/123/header.jpg',
                    library: 'https://cdn.akamai.steamstatic.com/steam/apps/123/library_600x900.jpg'
                }
            }

            // Should not throw, should return null for failed downloads
            const artworkBlobs = await steamClient.downloadGameArtwork(gameWithArtwork)

            expect(artworkBlobs).toEqual({
                icon: null,
                logo: null,
                header: null,
                library: null
            })
        })

        it('should cache downloaded images for reuse', async () => {
            const mockImageBlob = createMockBlob()
            const mockImageResponse = createMockFetchResponse(mockImageBlob)
            
            // Clear any existing cache first and wait for completion
            await steamClient.clearCache()
            
            // Give the IndexedDB mock time to complete the clear operation
            await new Promise(resolve => setTimeout(resolve, 10))
            
            fetchMock.mockResolvedValue(mockImageResponse)

            const imageUrl = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/123/icon.jpg'

            // First download
            const blob1 = await steamClient.downloadGameImage(imageUrl)
            expect(blob1).toBe(mockImageBlob)
            expect(fetchMock).toHaveBeenCalledTimes(1)

            // Reset mock call count for clearer testing
            fetchMock.mockClear()

            // Second download should come from cache (no additional fetch)
            const blob2 = await steamClient.downloadGameImage(imageUrl)
            expect(blob2).toBe(mockImageBlob)
            expect(fetchMock).toHaveBeenCalledTimes(0) // Should be 0 because of cache
        })
    })

    describe('Steam API Client Image Integration', () => {
        it('should expose image downloading methods', () => {
            expect(typeof steamClient.downloadGameImage).toBe('function')
            expect(typeof steamClient.downloadGameArtwork).toBe('function')
        })

        it('should provide cache management for images', () => {
            // These methods should exist on the client
            expect(typeof steamClient.clearCache).toBe('function')
            expect(typeof steamClient.getCacheStats).toBe('function')
        })
    })
})
