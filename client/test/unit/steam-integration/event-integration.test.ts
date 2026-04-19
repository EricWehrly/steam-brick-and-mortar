/**
 * Test to verify SteamIntegration functionality
 * Note: GamesBatchReady events are no longer emitted in the current architecture
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import { EventManager } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'

describe('SteamIntegration Event Integration', () => {
    let steamIntegration: SteamIntegration
    let mockEventManager: any
    let mockSteamClient: any

    beforeEach(() => {
        // Create mock EventManager
        mockEventManager = {
            emit: vi.fn(),
            registerEventHandler: vi.fn(),
            deregisterEventHandler: vi.fn()
        }
        
        // Mock EventManager.getInstance to return our mock
        vi.spyOn(EventManager, 'getInstance').mockReturnValue(mockEventManager)
        
        // Create SteamIntegration (should use our mocked EventManager)
        steamIntegration = new SteamIntegration()
        
        // Access the steamClient through the integration to mock it
        // @ts-expect-error - Accessing private property for testing
        mockSteamClient = steamIntegration.steamClient
        
        // Mock the methods we need
        mockSteamClient.resolveVanityUrl = vi.fn().mockResolvedValue({
            steamid: '123456789',
            vanity_url: 'testuser'
        })
        
        mockSteamClient.getUserGames = vi.fn().mockResolvedValue({
            game_count: 1,
            games: [{ appid: 730, name: 'Counter-Strike 2' }],
            vanity_url: 'testuser'
        })
        
        // Mock loadGamesProgressively to invoke the onBatchReady callback
        // This simulates the cache-first batch emission pattern
        const mockGame = {
            appid: 730,
            name: 'Counter-Strike 2',
            artwork: {
                icon: 'icon-url',
                logo: 'logo-url',
                header: 'header-url',
                library: 'library-url'
            }
        }
        mockSteamClient.loadGamesProgressively = vi.fn().mockImplementation(async (_steamUser, options) => {
            // Invoke the callback if provided (new cache-first pattern)
            if (options?.onBatchReady) {
                options.onBatchReady([mockGame], 0, 1)
            }
            return [mockGame]
        })
        
        mockSteamClient.downloadGameArtwork = vi.fn().mockResolvedValue({})
        
        // Mock the game library manager
        // @ts-expect-error - Accessing private property for testing
        steamIntegration.gameLibrary = {
            updateGameData: vi.fn(),
            setUserData: vi.fn(),
            getState: vi.fn().mockReturnValue({ userData: null, games: [] }),
            clear: vi.fn()
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('should successfully load games for user', async () => {
        // Mock the ValidationUtils
        const mockValidationUtils = await import('../../../src/utils')
        vi.spyOn(mockValidationUtils.ValidationUtils, 'parseSteamUserInput').mockReturnValue({
            type: 'customurl',
            value: 'testuser'
        })
        
        // Load games for user
        const promise = new Promise(resolve => {
            mockEventManager.registerEventHandler(SteamEventTypes.DataLoaded, resolve)
        })
        
        // Use the actual handleLoadLibrary method directly to bypass mock event manager routing issues
        await steamIntegration['handleLoadLibrary'](new CustomEvent(SteamEventTypes.LoadLibrary, {
            detail: { userInput: 'testuser' }
        }))
        
        // Wait for any microtasks to complete
        await new Promise(resolve => setTimeout(resolve, 0))
        
        // Verify that loadGamesProgressively was called (games were loaded)
        expect(mockSteamClient.loadGamesProgressively).toHaveBeenCalled()
        
        // Verify result structure
        const result = steamIntegration['getGameLibraryState']()
        expect(result).toBeDefined()
    })
    
    it('should successfully load games from cache', async () => {
        // Mock the ValidationUtils
        const mockValidationUtils = await import('../../../src/utils')
        vi.spyOn(mockValidationUtils.ValidationUtils, 'parseSteamUserInput').mockReturnValue({
            type: 'customurl',
            value: 'testuser'
        })
        
        // Mock cache data
        mockSteamClient.getUserGames = vi.fn().mockResolvedValue({
            game_count: 1,
            games: [{ appid: 730, name: 'Counter-Strike 2' }],
            vanity_url: 'testuser'
        })
        
        // Load games from cache
        const promise = new Promise(resolve => {
            mockEventManager.registerEventHandler(SteamEventTypes.DataLoaded, resolve)
        })
        
        // Use the actual handleLoadLibrary method directly to bypass mock event manager routing issues
        await steamIntegration['handleLoadLibrary'](new CustomEvent(SteamEventTypes.LoadLibrary, {
            detail: { userInput: 'testuser', forceUpdate: false }
        }))
        
        // Wait for any microtasks to complete
        await new Promise(resolve => setTimeout(resolve, 0))
        
        // Verify that games were loaded from cache
        expect(mockSteamClient.getUserGames).toHaveBeenCalled()
        
        // Verify result structure
        const result = steamIntegration['getGameLibraryState']()
        expect(result).toBeDefined()
    })
})