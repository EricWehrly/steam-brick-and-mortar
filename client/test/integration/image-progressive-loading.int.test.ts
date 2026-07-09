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
import { EventManager } from '../../src/core/EventManager'
import { SteamEventTypes } from '../../src/types/InteractionEvents'

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
        SteamApiClient.dispose()
        steamClient = SteamApiClient.getInstance()
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

            // Batch metadata fetch for uncached app details.
            fetchMock.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    success: true,
                    total_requested: 1,
                    total_successful: 1,
                    total_failed: 0,
                    results: [
                        {
                            success: true,
                            appid: mockGame.appid,
                            data: {
                                name: mockGame.name,
                                type: 'game',
                                is_free: false,
                                categories: [{ id: 1, description: 'Action' }],
                                genres: [{ id: '1', description: 'Action' }],
                                artwork: {
                                    header: mockGameResponse.artwork.header,
                                    capsule: null,
                                    capsule_v5: null,
                                    background: null,
                                    background_raw: null
                                }
                            },
                            retrieved_at: new Date().toISOString()
                        }
                    ],
                    timestamp: new Date().toISOString()
                })
            })

            const gamesLoaded: any[] = []
            let progressEventFired = false
            const eventManager = EventManager.getInstance()
            
            eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, ((event: CustomEvent) => {
                for (const game of event.detail.games) {
                    gamesLoaded.push(game)
                }
            }) as EventListener)
            
            eventManager.registerEventHandler(SteamEventTypes.NetworkFetchProgress, (() => {
                progressEventFired = true
            }) as EventListener)

            // Load games progressively
            const userGames = await steamClient.getUserGames('123')
            
            await steamClient.loadGamesProgressively(userGames, {
                maxGames: 1
            })

            await new Promise(resolve => setTimeout(resolve, 25))

            // Verify game was loaded with artwork URLs
            expect(gamesLoaded).toHaveLength(1)
            expect(gamesLoaded[0]).toMatchObject({
                appid: mockGame.appid,
                name: mockGame.name,
                artwork: expect.objectContaining({
                    icon: expect.stringContaining('steamcdn'),
                    logo: expect.stringContaining('steamcdn'),
                    header: expect.stringContaining('cdn.akamai'),
                    library: expect.stringContaining('cdn.akamai')
                })
            })

            // Verify progress event was fired
            expect(progressEventFired).toBe(true)
        })
    })

    describe('Steam API Client Cache Management', () => {
        it('should provide cache management methods', () => {
            // These methods should exist on the client for metadata caching
            expect(typeof steamClient.clearCache).toBe('function')
            expect(typeof steamClient.getCacheManager).toBe('function')
        })
    })
})
