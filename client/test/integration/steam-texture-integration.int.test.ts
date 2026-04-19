/**
 * Integration test for Steam game data to texture rendering
 * Tests the complete public API workflow from Steam data to rendered game boxes
 *
 * Note: Tests using the old progress-callback API (callbacks.onProgress, callbacks.onStatusUpdate),
 * getSteamClient(), and getGameLibraryState() were removed when SteamIntegration was refactored
 * to a fully event-driven model. New integration tests should drive behavior through events
 * and observe results via DataManager or emitted events.
 *
 * // TD: steam-integration-tests -- add event-driven integration tests for progressive loading
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SteamBrickAndMortarApp } from '../../src/core/SteamBrickAndMortarApp'
import { SteamEventTypes } from '../../src/types/InteractionEvents'
import type { SteamLoadLibraryEvent } from '../../src/types/InteractionEvents'
import type { SteamUser } from '../../src/steam'

// Mock IndexedDB for image cache
vi.mock('fake-indexeddb', () => ({
    default: {},
    IDBKeyRange: {}
}))

// Mock URL object methods
Object.defineProperty(globalThis, 'URL', {
    value: {
        createObjectURL: vi.fn(() => 'mock-blob-url'),
        revokeObjectURL: vi.fn()
    },
    writable: true
})

// Mock fetch for image downloads
globalThis.fetch = vi.fn()

describe('Steam Data to Texture Integration', () => {
    let app: SteamBrickAndMortarApp | null = null
    let mockSteamUser: SteamUser
    let webglAvailable = false

    beforeEach(async () => {
        // Setup mock Steam user data with proper type structure
        mockSteamUser = {
            steamid: '12345',
            vanity_url: 'testuser',
            game_count: 2,
            retrieved_at: new Date().toISOString(),
            games: [
                {
                    appid: 1,
                    name: 'Test Game 1',
                    playtime_forever: 120,
                    playtime_2weeks: 30,
                    img_icon_url: 'test-icon1.jpg',
                    img_logo_url: 'test-logo1.jpg',
                    artwork: {
                        icon: 'https://test.com/icon1.jpg',
                        logo: 'https://test.com/logo1.jpg',
                        header: 'https://test.com/header1.jpg',
                        library: 'https://test.com/library1.jpg'
                    }
                },
                {
                    appid: 2,
                    name: 'Test Game 2',
                    playtime_forever: 60,
                    playtime_2weeks: 0,
                    img_icon_url: 'test-icon2.jpg',
                    img_logo_url: 'test-logo2.jpg',
                    artwork: {
                        icon: 'https://test.com/icon2.jpg',
                        logo: 'https://test.com/logo2.jpg',
                        header: 'https://test.com/header2.jpg',
                        library: 'https://test.com/library2.jpg'
                    }
                }
            ]
        }

        try {
            app = new SteamBrickAndMortarApp({
                steam: {
                    apiBaseUrl: 'https://test-api.example.com',
                    maxGames: 5
                }
            })
            await app.init()
            webglAvailable = true
        } catch {
            console.warn('WebGL not available in test environment, skipping WebGL-dependent tests')
            webglAvailable = false
            app = null
        }
    })

    afterEach(() => {
        if (app) {
            app.dispose()
        }
        vi.clearAllMocks()
    })

    describe('Error Handling Integration', () => {
        it('should handle network failures gracefully in real workflow', async () => {
            if (!webglAvailable || !app) {
                console.log('WebGL not available, skipping test')
                return
            }

            const steamIntegration = app.getSteamIntegration()

            const steamClient = steamIntegration['steamClient']
            
            vi.spyOn(steamClient, 'getUserGames').mockRejectedValue(
                new Error('Steam API unavailable')
            )

            // Emit the event to trigger the load
            const loggerSpy = vi.spyOn(steamIntegration['logger'], 'error').mockImplementation(() => {})
            app['eventManager'].emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, { userInput: 'testuser' })
            
            // Wait for microtasks to clear
            await new Promise(resolve => setTimeout(resolve, 0))
            
            expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Library load failed'), expect.any(Error))
            loggerSpy.mockRestore()

            // App should remain in a valid state after failure
            expect(app.getSceneManager()).toBeDefined()
            expect(app.getSceneManager().getScene()).toBeDefined()
        })
    })
})
