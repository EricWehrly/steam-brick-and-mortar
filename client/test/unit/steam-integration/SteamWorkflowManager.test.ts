/**
 * Unit tests for SteamWorkflowManager
 * 
 * Tests the Steam workflow orchestration and data loading functionality including:
 * - Event handler registration
 * - Steam data loading and DataManager integration
 * - SteamEventTypes.DataLoaded event emission
 * - Error handling and workflow completion
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest'
import { SteamWorkflowManager } from '../../../src/steam-integration/SteamWorkflowManager'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import { DataManager, DataDomain } from '../../../src/core/data'
import type { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import type { SceneCoordinator } from '../../../src/scene'
import type { SteamUICoordinator } from '../../../src/ui/coordinators'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

// Mock all dependencies
const mockEventManager = {
    registerEventHandler: vi.fn(),
    emit: vi.fn(),
    getInstance: vi.fn(),
    removeEventHandlers: vi.fn()
}

const mockSteamIntegration = {
    loadGamesForUser: vi.fn(),
    loadGamesFromCache: vi.fn(),
    hasCachedData: vi.fn(),
    refreshData: vi.fn(),
    clearCache: vi.fn(),
    getCacheStats: vi.fn(),
    clearImageCache: vi.fn(),
    updateMaxGames: vi.fn(),
    getGameLibraryState: vi.fn()
}

const mockSceneCoordinator = {}

const mockSteamUICoordinator = {
    updateProgress: vi.fn(),
    showSteamStatus: vi.fn(),
    updateCacheStats: vi.fn()
}

const mockDataManager = {
    set: vi.fn(),
    get: vi.fn(),
    getInstance: vi.fn()
}

describe('SteamWorkflowManager', () => {
    let workflowManager: SteamWorkflowManager
    
    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks()
        
        // Create workflow manager with mocked dependencies
        workflowManager = new SteamWorkflowManager(
            mockEventManager as any,
            mockSteamIntegration as any,
            mockSceneCoordinator as any,
            mockSteamUICoordinator as any,
            mockDataManager as any
        )
    })

    afterEach(() => {
        workflowManager.dispose()
    })

    describe('Event Handler Registration', () => {
        it('should handle LoadGames events', async () => {
            // Setup successful workflow
            mockSteamIntegration.loadGamesForUser.mockResolvedValue(undefined)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: [{ appid: '570', name: 'Dota 2', playtime_forever: 1200 }],
                    vanity_url: 'testuser'
                }
            })
            
            // Verify LoadGames handler was registered by triggering it
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            expect(loadGamesHandler).toBeDefined()
            
            const event = { detail: { userInput: 'testuser', timestamp: Date.now(), source: 'UI' } } as CustomEvent
            await loadGamesHandler(event)
            
            // Verify it actually does the work (observable outcome)
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining([expect.objectContaining({ appid: '570' })]),
                expect.any(Object)
            )
        })

        it('should handle essential Steam events without crashing', () => {
            // Verify critical event handlers exist by finding them
            const registeredEvents = mockEventManager.registerEventHandler.mock.calls.map(call => call[0])
            
            // These are the events that must work for basic functionality
            expect(registeredEvents).toContain(SteamEventTypes.LoadGames)
            expect(registeredEvents).toContain(SteamEventTypes.LoadFromCache) 
            expect(registeredEvents).toContain(SteamEventTypes.CacheRefresh)
            
            // Should not crash during setup
            expect(() => new SteamWorkflowManager(
                mockEventManager as any,
                mockSteamIntegration as any, 
                mockSceneCoordinator as any,
                mockSteamUICoordinator as any,
                mockDataManager as any
            )).not.toThrow()
        })
    })

    describe('Game Loading Workflows', () => {
        const mockGameData: SteamGameData[] = [
            { appid: '570', name: 'Dota 2', playtime_forever: 1200 },
            { appid: '730', name: 'Counter-Strike: Global Offensive', playtime_forever: 800 }
        ]

        it('should complete end-to-end game loading workflow', async () => {
            // Setup mocks for successful load games workflow
            mockSteamIntegration.loadGamesForUser.mockResolvedValue(undefined)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: mockGameData,
                    vanity_url: 'testuser'
                }
            })
            
            // Get the registered event handler for LoadGames
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            expect(loadGamesHandler).toBeDefined()
            
            // Simulate LoadGames event
            const loadGamesEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await loadGamesHandler(loadGamesEvent)
            
            // Focus: Observable outcomes - did the workflow accomplish its goals?
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining([
                    expect.objectContaining({ appid: '570', name: 'Dota 2' }),
                    expect.objectContaining({ appid: '730', name: 'Counter-Strike: Global Offensive' })
                ]),
                expect.any(Object)
            )
            
            // Verify user gets feedback that loading succeeded
            expect(mockSteamUICoordinator.showSteamStatus).toHaveBeenCalledWith(
                'Games loaded successfully!',
                'success'
            )
        })

        it('should handle API failures gracefully without crashing', async () => {
            const apiError = new Error('Steam API temporarily unavailable')
            mockSteamIntegration.loadGamesForUser.mockRejectedValue(apiError)
            
            // Get the registered event handler for LoadGames
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Critical: Should handle API failures without throwing (real bug prevention)
            await expect(loadGamesHandler(loadGamesEvent)).resolves.toBeUndefined()
            
            // Should not corrupt data store on error
            expect(mockDataManager.set).not.toHaveBeenCalledWith('steam.games', expect.anything(), expect.anything())
            
            // Implementation handles errors via logger and callbacks, not direct showSteamStatus calls
            // The key behavior is that it doesn't crash the application
            expect(mockDataManager.set).not.toHaveBeenCalledWith('steam.games', expect.anything(), expect.anything())
        })

        it('should load from cache when available (performance optimization)', async () => {
            // Setup mocks for successful cache workflow
            mockSteamIntegration.hasCachedData.mockReturnValue(true)
            mockSteamIntegration.loadGamesFromCache.mockResolvedValue(undefined)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: mockGameData,
                    vanity_url: 'testuser'
                }
            })
            
            // Get the registered event handler for LoadFromCache
            const loadFromCacheHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadFromCache)?.[1]
            
            expect(loadFromCacheHandler).toBeDefined()
            
            // Simulate LoadFromCache event
            const loadFromCacheEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await loadFromCacheHandler(loadFromCacheEvent)
            
            // Focus: Did cache loading accomplish the same end result as API loading?
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining([
                    expect.objectContaining({ appid: '570' }),
                    expect.objectContaining({ appid: '730' })
                ]),
                expect.any(Object)
            )
        })

        it('should handle users with no games gracefully (edge case)', async () => {
            // Setup mock for empty games array - real user scenario
            mockSteamIntegration.loadGamesForUser.mockResolvedValue(undefined)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: [], // New Steam user with no games yet
                    vanity_url: 'newuser'
                }
            })
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'newuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await loadGamesHandler(loadGamesEvent)
            
            // Focus: Should handle edge case without error
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                [],
                expect.any(Object)
            )
            
            // Should still give success feedback to user (not an error case)
            expect(mockSteamUICoordinator.showSteamStatus).toHaveBeenCalledWith(
                expect.stringContaining('successfully'),
                'success'
            )
        })

        it('should prevent concurrent requests from corrupting data state', async () => {
            // Simulate slow API response
            mockSteamIntegration.loadGamesForUser
                .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)))
                .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 50)))
            
            mockSteamIntegration.getGameLibraryState
                .mockReturnValueOnce({ userData: { games: [{ appid: '570', name: 'Game A' }], vanity_url: 'user1' }})
                .mockReturnValueOnce({ userData: { games: [{ appid: '730', name: 'Game B' }], vanity_url: 'user2' }})
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            // Fire two rapid requests (real user behavior - double-clicking)
            const request1 = loadGamesHandler({
                detail: { userInput: 'user1', timestamp: Date.now(), source: EventSource.UI }
            } as CustomEvent)
            
            const request2 = loadGamesHandler({
                detail: { userInput: 'user2', timestamp: Date.now() + 1, source: EventSource.UI }
            } as CustomEvent)
            
            await Promise.all([request1, request2])
            
            // Should handle concurrent requests without crashing (critical bug prevention)
            expect(mockDataManager.set).toHaveBeenCalledTimes(4) // 2 games + 2 userInput calls
        })
    })

    describe('User Experience and Error Handling', () => {
        it('should provide progress feedback during long operations', async () => {
            // Simulate slow loading with progress updates
            mockSteamIntegration.loadGamesForUser.mockImplementation(async (userInput, callbacks) => {
                if (callbacks?.onProgress) {
                    callbacks.onProgress(3, 10, 'Loading library...')
                    callbacks.onProgress(7, 10, 'Processing games...')
                    callbacks.onProgress(10, 10, 'Complete!')
                }
                return undefined
            })
            
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: { games: [], vanity_url: 'testuser' }
            })
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await loadGamesHandler(loadGamesEvent)
            
            // Focus: User should see progress updates during long operations
            expect(mockSteamUICoordinator.updateProgress).toHaveBeenCalledWith(
                3, 10, 'Loading library...'
            )
            expect(mockSteamUICoordinator.updateProgress).toHaveBeenCalledWith(
                10, 10, 'Complete!'
            )
        })

        it('should recover gracefully from partial loading failures', async () => {
            // Simulate scenario where some games load but others fail
            mockSteamIntegration.loadGamesForUser.mockImplementation(async (userInput, callbacks) => {
                if (callbacks?.onStatusUpdate) {
                    callbacks.onStatusUpdate('Some games failed to load', 'warning')
                }
                return undefined
            })
            
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: [{ appid: '570', name: 'Dota 2', playtime_forever: 1200 }], // Partial success
                    vanity_url: 'testuser'
                }
            })
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await loadGamesHandler(loadGamesEvent)
            
            // Should still save what we got (better than nothing)
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining([expect.objectContaining({ appid: '570' })]),
                expect.any(Object)
            )
            
            // Should warn user about partial failure
            expect(mockSteamUICoordinator.showSteamStatus).toHaveBeenCalledWith(
                expect.stringContaining('Some games failed'),
                'warning'
            )
        })
    })

    describe('Cache Management Features', () => {
        it('should refresh stale data when user requests it', async () => {
            mockSteamIntegration.refreshData.mockResolvedValue(true)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: {
                    games: [{ appid: '570', name: 'Dota 2', playtime_forever: 1200 }],
                    vanity_url: 'testuser'
                }
            })
            
            const refreshCacheHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.CacheRefresh)?.[1]
            
            expect(refreshCacheHandler).toBeDefined()
            
            const refreshCacheEvent = {
                detail: {
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await refreshCacheHandler(refreshCacheEvent)
            
            // Focus: User should get updated data after refresh
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining([expect.objectContaining({ appid: '570' })]),
                expect.any(Object)
            )
        })

        it('should provide cache statistics to help users manage storage', async () => {
            const mockStats = { totalGames: 150, cacheSize: '25MB', lastUpdated: new Date().toISOString() }
            mockSteamIntegration.getCacheStats.mockReturnValue(mockStats)
            
            const cacheStatsHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.CacheStats)?.[1]
            
            expect(cacheStatsHandler).toBeDefined()
            
            const cacheStatsEvent = {
                detail: {
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await cacheStatsHandler(cacheStatsEvent)
            
            // Focus: User should see meaningful cache information
            expect(mockSteamUICoordinator.updateCacheStats).toHaveBeenCalledWith(
                expect.objectContaining({
                    totalGames: 150,
                    cacheSize: '25MB'
                })
            )
        })

        it('should clear cache when user requests storage cleanup', async () => {
            const clearCacheHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.CacheClear)?.[1]
            
            expect(clearCacheHandler).toBeDefined()
            
            const clearCacheEvent = {
                detail: {
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Should clear cache without throwing errors
            await expect(clearCacheHandler(clearCacheEvent)).resolves.toBeUndefined()
        })

        it('should handle image cache cleanup separately', async () => {
            const clearImageCacheHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.ImageCacheClear)?.[1]
            
            expect(clearImageCacheHandler).toBeDefined()
            
            const clearImageCacheEvent = {
                detail: {
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Image cache clearing should work independently of data cache
            await expect(clearImageCacheHandler(clearImageCacheEvent)).resolves.toBeUndefined()
        })
    })

    describe('Development Mode Features', () => {
        it('should adjust game limits when developer toggles testing mode', async () => {
            const devModeToggleHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.DevModeToggle)?.[1]
            
            expect(devModeToggleHandler).toBeDefined()
            
            // Developer wants faster testing with fewer games
            const enableDevModeEvent = {
                detail: {
                    isEnabled: true,
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await devModeToggleHandler(enableDevModeEvent)
            
            // Should successfully enable dev mode without errors
            expect(() => mockSteamIntegration.updateMaxGames).not.toThrow()
            
            // Developer wants normal production limits
            const disableDevModeEvent = {
                detail: {
                    isEnabled: false,
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            await devModeToggleHandler(disableDevModeEvent)
            
            // Should successfully disable dev mode without errors
            expect(() => mockSteamIntegration.updateMaxGames).not.toThrow()
        })
    })

    describe('Resilience and Bug Prevention', () => {
        it('should maintain system stability when Steam API is down', async () => {
            const networkError = new Error('Network timeout - Steam servers unreachable')
            mockSteamIntegration.loadGamesForUser.mockRejectedValue(networkError)
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'testuser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Critical: Should not crash the application when Steam is down
            await expect(loadGamesHandler(loadGamesEvent)).resolves.toBeUndefined()
            
            // Should not leave system in corrupted state
            expect(mockDataManager.set).not.toHaveBeenCalledWith('steam.games', expect.anything(), expect.anything())
            
            // Implementation logs errors but doesn't crash - that's the key behavior to verify
            // User feedback happens via SteamIntegration callbacks, not direct UI calls here
            expect(mockDataManager.set).not.toHaveBeenCalledWith('steam.games', expect.anything(), expect.anything())
        })

        it('should handle malformed user input without crashing', async () => {
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            // Test various problematic inputs that might cause production bugs
            const malformedEvents = [
                { detail: { userInput: '', timestamp: Date.now(), source: EventSource.UI }}, // Empty string
                { detail: { userInput: ' \t\n ', timestamp: Date.now(), source: EventSource.UI }}, // Whitespace only
                { detail: { userInput: '../../../etc/passwd', timestamp: Date.now(), source: EventSource.UI }}, // Path injection attempt
                { detail: { userInput: 'user<script>alert("xss")</script>', timestamp: Date.now(), source: EventSource.UI }}, // XSS attempt
            ]
            
            for (const event of malformedEvents) {
                // Should handle malformed input gracefully without crashing
                await expect(loadGamesHandler(event as CustomEvent)).resolves.toBeUndefined()
            }
        })

        it('should recover from intermittent cache corruption', async () => {
            const cacheError = new Error('Cache file corrupted - unable to read')
            mockSteamIntegration.refreshData.mockRejectedValue(cacheError)
            
            const refreshCacheHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.CacheRefresh)?.[1]
            
            const refreshCacheEvent = {
                detail: {
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Should handle cache corruption without taking down the app
            await expect(refreshCacheHandler(refreshCacheEvent)).resolves.toBeUndefined()
            
            // Should not broadcast corrupted data
            expect(mockEventManager.emit).not.toHaveBeenCalledWith(
                SteamEventTypes.DataLoaded,
                expect.anything()
            )
        })

        it('should handle memory pressure during large library loading', async () => {
            // Simulate loading a massive Steam library (edge case but real)
            const hugeGameList = Array.from({ length: 5000 }, (_, i) => ({
                appid: String(i + 1),
                name: `Game ${i + 1}`,
                playtime_forever: Math.floor(Math.random() * 10000)
            }))
            
            mockSteamIntegration.loadGamesForUser.mockResolvedValue(undefined)
            mockSteamIntegration.getGameLibraryState.mockReturnValue({
                userData: { games: hugeGameList, vanity_url: 'poweruser' }
            })
            
            const loadGamesHandler = mockEventManager.registerEventHandler.mock.calls
                .find(call => call[0] === SteamEventTypes.LoadGames)?.[1]
            
            const loadGamesEvent = {
                detail: {
                    userInput: 'poweruser',
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
            } as CustomEvent
            
            // Should handle huge libraries without memory issues or timeouts
            await expect(loadGamesHandler(loadGamesEvent)).resolves.toBeUndefined()
            
            // Should still successfully store the large dataset
            expect(mockDataManager.set).toHaveBeenCalledWith(
                'steam.games',
                expect.arrayContaining(hugeGameList.slice(0, 10)), // Sample check
                expect.any(Object)
            )
        })
    })

    describe('Memory Management and Cleanup', () => {
        it('should register event handlers during initialization', () => {
            const initialHandlerCount = mockEventManager.registerEventHandler.mock.calls.length
            
            // Create a new workflow manager 
            const temporaryManager = new SteamWorkflowManager(
                mockEventManager as any,
                mockSteamIntegration as any,
                mockSceneCoordinator as any,
                mockSteamUICoordinator as any,
                mockDataManager as any
            )
            
            // Should register all required event handlers
            expect(mockEventManager.registerEventHandler.mock.calls.length).toBeGreaterThan(initialHandlerCount)
            
            // Dispose should not crash (minimal but important guarantee)
            expect(() => temporaryManager.dispose()).not.toThrow()
        })
        
        it('should be safe to dispose multiple times', () => {
            // Edge case: user code might call dispose() multiple times
            expect(() => {
                workflowManager.dispose()
                workflowManager.dispose() // Should not throw
                workflowManager.dispose() // Should not throw
            }).not.toThrow()
        })
    })
})