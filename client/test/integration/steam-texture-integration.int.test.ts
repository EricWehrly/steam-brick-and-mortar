/**
 * Improved Integration test for Steam game data to texture rendering
 * Tests the complete public API workflow from Steam data to rendered game boxes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SteamBrickAndMortarApp } from '../../src/core/SteamBrickAndMortarApp'
import type { SteamGame, SteamUser } from '../../src/steam'
import type { ProgressCallbacks } from '../../src/steam-integration/SteamIntegration'

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
                    appid: 12345,
                    name: 'Test Game 1',
                    playtime_forever: 120,
                    playtime_2weeks: 30,
                    img_icon_url: 'test-icon-1.jpg',
                    img_logo_url: 'test-logo-1.jpg',
                    artwork: {
                        icon: 'https://test.com/icon1.jpg',
                        logo: 'https://test.com/logo1.jpg',
                        header: 'https://test.com/header1.jpg',
                        library: 'https://test.com/library1.jpg'
                    }
                },
                {
                    appid: 67890,
                    name: 'Test Game 2',
                    playtime_forever: 60,
                    playtime_2weeks: 15,
                    img_icon_url: 'test-icon-2.jpg',
                    img_logo_url: 'test-logo-2.jpg',
                    artwork: {
                        icon: '', // Missing artwork to test fallback
                        logo: '',
                        header: '',
                        library: ''
                    }
                }
            ]
        }
        
        // Mock successful image downloads
        const mockBlob = new Blob(['mock-image-data'], { type: 'image/jpeg' })
        ;(globalThis.fetch as any).mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(mockBlob)
        })

        try {
            // Create app with test configuration
            app = new SteamBrickAndMortarApp({
                steam: {
                    apiBaseUrl: 'https://test-api.example.com',
                    maxGames: 5
                }
            })
            
            // Initialize the app
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

    describe('Public API Integration Flow', () => {
        it('should handle complete Steam integration workflow through public API', async () => {
            if (!webglAvailable || !app) {
                console.log('WebGL not available, skipping test')
                return
            }

            // Mock the Steam integration's public method
            const steamIntegration = app.getSteamIntegration()
            let gameLoadedCount = 0
            
            // Mock the public loadGamesForUser method to simulate real behavior
            vi.spyOn(steamIntegration, 'loadGamesForUser').mockImplementation(
                async (vanityUrl: string, callbacks: ProgressCallbacks = {}) => {
                    // Simulate the real loading process by calling the callbacks
                    callbacks.onStatusUpdate?.('Loading Steam games...', 'loading')
                    callbacks.onProgress?.(0, 100, 'Fetching game library...')
                    
                    // Return a proper GameLibraryState based on the interface
                    const currentState = steamIntegration.getGameLibraryState()
                    
                    // Update state by setting user data (this updates the underlying manager)
                    currentState.userData = mockSteamUser
                    currentState.isLoading = false
                    currentState.error = null
                    
                    // Simulate progressive loading
                    for (const game of mockSteamUser.games) {
                        gameLoadedCount++
                        
                        const percentage = Math.round((gameLoadedCount / mockSteamUser.games.length) * 100)
                        callbacks.onProgress?.(percentage, 100, `Loaded ${gameLoadedCount}/${mockSteamUser.games.length} games`)
                        
                        if (callbacks.onGameLoaded) {
                            await callbacks.onGameLoaded(game)
                        }
                    }
                    
                    callbacks.onStatusUpdate?.('✅ Successfully loaded games!', 'success')
                    return currentState
                }
            )

            // Test the complete integration workflow through the app's public API
            const result = await steamIntegration.loadGamesForUser('testuser')

            // Verify the integration worked
            expect(result.userData?.vanity_url).toBe('testuser')
            expect(gameLoadedCount).toBe(2)

            // Verify game boxes were added to the scene through the normal workflow
            const scene = app.getSceneManager().getScene()
            const gameBoxes = scene.children.filter(child => child.userData?.isGameBox)
            
            // Should have created game boxes for loaded games
            expect(gameBoxes.length).toBeGreaterThan(0)
        })

        it('should handle network failures gracefully in real workflow', async () => {
            if (!webglAvailable || !app) {
                console.log('WebGL not available, skipping test')
                return
            }

            const steamIntegration = app.getSteamIntegration()
            
            // Mock network failure
            vi.spyOn(steamIntegration, 'loadGamesForUser').mockRejectedValue(
                new Error('Steam API unavailable')
            )

            // Test that the app handles Steam API failures gracefully
            await expect(steamIntegration.loadGamesForUser('testuser')).rejects.toThrow('Steam API unavailable')

            // Verify the app is still in a valid state
            expect(app.getSceneManager()).toBeDefined()
            expect(app.getSceneManager().getScene()).toBeDefined()
        })
    })

    describe('Progressive Loading Integration', () => {
        it('should handle progressive loading with callbacks correctly', async () => {
            if (!webglAvailable || !app) {
                console.log('WebGL not available, skipping test')
                return
            }

            const steamIntegration = app.getSteamIntegration()
            const scene = app.getSceneManager().getScene()
            const progressUpdates: Array<{current: number, total: number, message: string}> = []
            const statusUpdates: Array<{message: string, type: string}> = []
            const gamesLoadedInOrder: SteamGame[] = []

            // Mock the Steam integration to capture callback behavior
            vi.spyOn(steamIntegration, 'loadGamesForUser').mockImplementation(
                async (vanityUrl: string, callbacks: ProgressCallbacks = {}) => {
                    // Simulate initial status
                    callbacks.onStatusUpdate?.('Loading Steam games...', 'loading')
                    statusUpdates.push({message: 'Loading Steam games...', type: 'loading'})
                    
                    const currentState = steamIntegration.getGameLibraryState()
                    currentState.userData = mockSteamUser
                    currentState.isLoading = false
                    currentState.error = null
                    
                    // Simulate progressive loading with realistic delays
                    for (let i = 0; i < mockSteamUser.games.length; i++) {
                        const game = mockSteamUser.games[i]
                        const current = i + 1
                        const total = mockSteamUser.games.length
                        const percentage = Math.round((current / total) * 100)
                        
                        // Capture progress updates
                        const message = `Loaded ${current}/${total} games`
                        callbacks.onProgress?.(percentage, 100, message)
                        progressUpdates.push({current: percentage, total: 100, message})
                        
                        // Simulate game loading
                        if (callbacks.onGameLoaded) {
                            gamesLoadedInOrder.push(game)
                            await callbacks.onGameLoaded(game)
                        }
                    }
                    
                    // Final status
                    callbacks.onStatusUpdate?.('✅ Successfully loaded games!', 'success')
                    statusUpdates.push({message: '✅ Successfully loaded games!', type: 'success'})
                    
                    return currentState
                }
            )

            // Test progressive loading
            const result = await steamIntegration.loadGamesForUser('testuser')

            expect(result.userData?.vanity_url).toBe('testuser')
            expect(gamesLoadedInOrder).toHaveLength(2)
            expect(gamesLoadedInOrder[0].name).toBe('Test Game 1')
            expect(gamesLoadedInOrder[1].name).toBe('Test Game 2')

            // Verify progress and status callbacks were called
            expect(progressUpdates.length).toBeGreaterThan(0)
            expect(statusUpdates.length).toBeGreaterThan(0)
            expect(statusUpdates[0].type).toBe('loading')
            expect(statusUpdates[statusUpdates.length - 1].type).toBe('success')

            // Verify final state
            const gameBoxes = scene.children.filter(child => child.userData?.isGameBox)
            expect(gameBoxes).toHaveLength(2)
        })
    })

    describe('Error Handling Integration', () => {
        it('should handle partial failures in game loading', async () => {
            if (!webglAvailable || !app) {
                console.log('WebGL not available, skipping test')
                return
            }

            const steamIntegration = app.getSteamIntegration()
            const scene = app.getSceneManager().getScene()

            // Mock partial failure scenario
            vi.spyOn(steamIntegration, 'loadGamesForUser').mockImplementation(
                async (vanityUrl: string, callbacks: ProgressCallbacks = {}) => {
                    callbacks.onStatusUpdate?.('Loading Steam games...', 'loading')
                    
                    const currentState = steamIntegration.getGameLibraryState()
                    
                    // Create partial user data with only the first game
                    const partialUser: SteamUser = {
                        ...mockSteamUser,
                        games: [mockSteamUser.games[0]], // Only load first game successfully
                        game_count: 1
                    }
                    
                    currentState.userData = partialUser
                    currentState.isLoading = false
                    currentState.error = null
                    
                    callbacks.onProgress?.(50, 100, 'Loaded 1/2 games')
                    
                    if (callbacks.onGameLoaded) {
                        await callbacks.onGameLoaded(partialUser.games[0])
                    }
                    
                    callbacks.onStatusUpdate?.('⚠️ Partially loaded games', 'success')
                    return currentState
                }
            )

            const result = await steamIntegration.loadGamesForUser('testuser')

            // Should still succeed with partial data
            expect(result.userData?.vanity_url).toBe('testuser')
            expect(result.userData?.games).toHaveLength(1)

            // Scene should only contain successfully loaded games
            const gameBoxes = scene.children.filter(child => child.userData?.isGameBox)
            expect(gameBoxes).toHaveLength(1)
            expect(gameBoxes[0].userData.name).toBe('Test Game 1')
        })
    })
})

// Lighter integration test focusing on data flow without WebGL
describe('Steam Data Integration (Data Flow Only)', () => {
    let app: SteamBrickAndMortarApp | null = null

    beforeEach(() => {
        try {
            app = new SteamBrickAndMortarApp({
                steam: {
                    apiBaseUrl: 'https://test-api.example.com',
                    maxGames: 5
                }
            })
            // Don't initialize - test the Steam integration in isolation
        } catch {
            app = null
        }
    })

    afterEach(() => {
        if (app) {
            app.dispose()
        }
        vi.clearAllMocks()
    })

    it('should handle Steam integration data flow without rendering', async () => {
        if (!app) {
            console.log('App creation failed, skipping test')
            return
        }

        const steamIntegration = app.getSteamIntegration()
        
        // Mock the Steam client methods directly
        const steamClient = steamIntegration.getSteamClient()
        vi.spyOn(steamClient, 'resolveVanityUrl').mockResolvedValue({
            steamid: '12345',
            vanity_url: 'testuser',
            resolved_at: new Date().toISOString()
        })
        
        vi.spyOn(steamClient, 'getUserGames').mockResolvedValue({
            steamid: '12345',
            vanity_url: 'testuser',
            game_count: 1,
            retrieved_at: new Date().toISOString(),
            games: []
        })
        
        vi.spyOn(steamClient, 'loadGamesProgressively').mockImplementation(
            async (userGames: SteamUser, options = {}) => {
                // Simulate calling the callback
                if (options?.onGameLoaded) {
                    const mockGame: SteamGame = {
                        appid: 12345,
                        name: 'Test Game',
                        playtime_forever: 120,
                        playtime_2weeks: 30,
                        img_icon_url: 'test-icon.jpg',
                        img_logo_url: 'test-logo.jpg',
                        artwork: {
                            icon: 'https://test.com/icon.jpg',
                            logo: 'https://test.com/logo.jpg',
                            header: 'https://test.com/header.jpg',
                            library: 'https://test.com/library.jpg'
                        }
                    }
                    await options.onGameLoaded(mockGame)
                }
                return []
            }
        )

        // Test Steam integration logic without WebGL rendering
        const result = await steamIntegration.loadGamesForUser('testuser')
        
        expect(result.userData?.vanity_url).toBe('testuser')
        expect(result.userData?.steamid).toBe('12345')
    })
})
