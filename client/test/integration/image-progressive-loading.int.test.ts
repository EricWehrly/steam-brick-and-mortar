/**
 * Integration tests for progressive game loading
 * Tests the full workflow from game loading to callbacks
 * 
 * Note: Image downloading methods (downloadGameImage, downloadGameArtwork) were removed
 * from SteamApiClient as part of the texture cache refactor. Texture loading now goes
 * directly through TextureWorker and PixelDataCache.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SteamApiClient } from '../../src/steam/SteamApiClient'
import { setupIndexedDBMock } from '../mocks/indexeddb.mock'
import { 
    setupFetchMock, 
    mockGame 
} from '../utils/test-helpers'

describe('Progressive Loading Integration Tests', () => {
    let steamClient: SteamApiClient
    let fetchMock: ReturnType<typeof setupFetchMock>

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

    describe('Progressive Loading', () => {
        it('should load games progressively with callbacks', async () => {
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

            // Verify game loading callback was called with artwork URLs
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
    })

    describe('Steam API Client Cache Management', () => {
        it('should provide cache management methods', () => {
            // These methods should exist on the client for metadata caching
            expect(typeof steamClient.clearCache).toBe('function')
            expect(typeof steamClient.getCacheStats).toBe('function')
        })
    })
})
