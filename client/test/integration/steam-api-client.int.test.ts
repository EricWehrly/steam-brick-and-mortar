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

    beforeEach(() => {
        // Setup all mocks
        setupIndexedDBMock()
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
            
            expect(result).toHaveLength(1)
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
            
            expect(result).toHaveLength(1)
            expect(loadedGames).toHaveLength(1)
            expect(loadedGames[0]).toMatchObject(mockGame)
        })

        it('should not call fetch when loading games without artwork', async () => {
            const result = await client.loadGamesProgressively(mockUser, {
                maxGames: 1
            })
            
            expect(result).toHaveLength(1)
            expect(fetchMock).not.toHaveBeenCalled()
        })
    })
})
