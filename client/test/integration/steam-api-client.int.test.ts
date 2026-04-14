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
import { setupIndexedDBMock } from '../mocks/indexeddb.mock'
import { EventManager } from '../../src/core/EventManager'
import { SteamEventTypes } from '../../src/types/InteractionEvents'

describe('SteamApiClient Integration Tests', () => {
    let client: SteamApiClient
    let fetchMock: any
    let localStorageMock: any

    const createBatchResponse = (appids: number[]) => ({
        success: true,
        total_requested: appids.length,
        total_successful: appids.length,
        total_failed: 0,
        cache_hits: 0,
        cache_misses: appids.length,
        results: appids.map(appid => ({
            success: true,
            appid,
            data: {
                name: `Game ${appid}`,
                type: 'game',
                is_free: false,
                categories: [{ id: 1, description: 'Action' }],
                genres: [{ id: '1', description: 'Action' }],
                artwork: {
                    header: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
                    capsule: null,
                    capsule_v5: null,
                    background: null,
                    background_raw: null
                }
            },
            retrieved_at: new Date().toISOString()
        })),
        timestamp: new Date().toISOString()
    })

    beforeEach(() => {
        // Setup all mocks
        setupIndexedDBMock()
        fetchMock = setupFetchMock()
        localStorageMock = setupLocalStorageMock()

        fetchMock.mockImplementation((input: string | URL | Request) => {
            const url = String(input)
            if (url.includes('/batch-appdetails?appids=')) {
                const query = url.split('appids=')[1] || ''
                const appids = query
                    .split(',')
                    .map(part => Number(part))
                    .filter(Number.isFinite)
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(createBatchResponse(appids))
                })
            }

            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({})
            })
        })
        
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

        it('should bypass cache and fetch new data when ignoreCache is true', async () => {
            const mockResponse1 = { steamid: '12345', vanity_url: 'testuser', resolved_at: new Date().toISOString() }
            const mockResponse2 = { steamid: '12345', vanity_url: 'testuser', resolved_at: new Date().toISOString() }
            
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockResponse1)
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve(mockResponse2)
                })

            // First call caches the data
            await client.resolveVanityUrl('testuser')
            
            // Second call with ignoreCache=true forces network fetch instead of returning cached value
            await client.resolveVanityUrl('testuser', true)
            
            // fetchMock should have been called twice, ignoring the cache
            expect(fetchMock).toHaveBeenCalledTimes(2)
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
            let progressEventFired = false
            const eventManager = EventManager.getInstance()
            
            eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, ((event: CustomEvent) => {
                for (const game of event.detail.games) {
                    loadedGames.push(game)
                }
            }) as EventListener)
            
            eventManager.registerEventHandler(SteamEventTypes.NetworkFetchProgress, (() => {
                progressEventFired = true
            }) as EventListener)
            
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1
            })

            // Uncached metadata is fetched/emitted in background.
            await new Promise(resolve => setTimeout(resolve, 25))
            
            expect(result).toHaveLength(0)
            expect(loadedGames).toHaveLength(1)
            expect(progressEventFired).toBe(true)
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
            const eventManager = EventManager.getInstance()
            
            eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, ((event: CustomEvent) => {
                for (const game of event.detail.games) {
                    loadOrder.push(game)
                }
            }) as EventListener)
            
            await client.loadGamesProgressively(multiGameUser, {
                maxGames: 3
            })

            await new Promise(resolve => setTimeout(resolve, 25))

            expect(loadOrder).toHaveLength(3)
            
            // Should be ordered by playtime (descending)
            expect(loadOrder[0].playtime_forever).toBe(500)
            expect(loadOrder[1].playtime_forever).toBe(200)
            expect(loadOrder[2].playtime_forever).toBe(100)
        })
    })

    describe('Error Handling', () => {
        it('should handle API errors gracefully', async () => {
            fetchMock.mockRejectedValue(new Error('API Error'))
            
            await expect(client.resolveVanityUrl('invaliduser'))
                .rejects.toThrow('API Error')
        })
    })

    describe('Progressive Loading Integration', () => {
        it('should integrate progressive loading with game processing', async () => {
            const loadedGames: any[] = []
            const eventManager = EventManager.getInstance()
            
            eventManager.registerEventHandler(SteamEventTypes.GamesBatchReady, ((event: CustomEvent) => {
                for (const game of event.detail.games) {
                    loadedGames.push(game)
                }
            }) as EventListener)
            
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1
            })

            await new Promise(resolve => setTimeout(resolve, 25))
            
            expect(result).toHaveLength(0)
            expect(loadedGames).toHaveLength(1)
            // The batch mock in integration tests returns 'Game {appid}' as the name for uncached apps.
            const expectedGame = { ...mockGame, name: `Game ${mockGame.appid}` }
            expect(loadedGames[0]).toMatchObject(expectedGame)
        })

        it('should not call fetch when loading games without artwork', async () => {
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1
            })

            await new Promise(resolve => setTimeout(resolve, 25))

            const calledUrls = fetchMock.mock.calls.map(([url]: [string | URL | Request]) => String(url))
            
            expect(result).toHaveLength(0)
            expect(calledUrls.some(url => url.includes('/batch-appdetails'))).toBe(true)
            expect(calledUrls.some(url => url.includes('steamcdn') || url.includes('akamai.steamstatic'))).toBe(false)
        })
    })
})
