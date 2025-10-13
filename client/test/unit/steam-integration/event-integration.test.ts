/**
 * Test to verify SteamIntegration emits GameLoaded events
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
            emit: vi.fn()
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
        
        mockSteamClient.loadGamesProgressively = vi.fn().mockResolvedValue([{
            appid: 730,
            name: 'Counter-Strike 2',
            artwork: {
                icon: 'icon-url',
                logo: 'logo-url',
                header: 'header-url',
                library: 'library-url'
            }
        }])
        
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

    it('should emit GameLoaded event when a game is loaded', async () => {
        // Mock the ValidationUtils
        const mockValidationUtils = await import('../../../src/utils')
        vi.spyOn(mockValidationUtils.ValidationUtils, 'parseSteamUserInput').mockReturnValue({
            type: 'customurl',
            value: 'testuser'
        })
        
        // Load games for user
        await steamIntegration.loadGamesForUser('testuser', {})
        
        // Verify that GameLoaded event was emitted
        expect(mockEventManager.emit).toHaveBeenCalledWith(
            SteamEventTypes.GameLoaded,
            expect.objectContaining({
                game: expect.objectContaining({
                    appid: 730,
                    name: 'Counter-Strike 2'
                }),
                timestamp: expect.any(Number),
                source: 'system'
            })
        )
    })
    
    it('should emit GameLoaded event when loading from cache', async () => {
        // Mock the ValidationUtils
        const mockValidationUtils = await import('../../../src/utils')
        vi.spyOn(mockValidationUtils.ValidationUtils, 'parseSteamUserInput').mockReturnValue({
            type: 'customurl',
            value: 'testuser'
        })
        
        // Mock cache data
        mockSteamClient.getCached = vi.fn().mockImplementation((key) => {
            if (key === 'resolve_testuser') {
                return { steamid: '123456789', vanity_url: 'testuser' }
            }
            if (key === 'games_123456789') {
                return {
                    game_count: 1,
                    games: [{ appid: 730, name: 'Counter-Strike 2' }],
                    vanity_url: 'testuser'
                }
            }
            if (key === 'game_730') {
                return {
                    appid: 730,
                    name: 'Counter-Strike 2',
                    artwork: {
                        icon: 'icon-url',
                        logo: 'logo-url', 
                        header: 'header-url',
                        library: 'library-url'
                    }
                }
            }
            return null
        })
        
        // Load games from cache
        await steamIntegration.loadGamesFromCache('testuser', {})
        
        // Verify that GameLoaded event was emitted
        expect(mockEventManager.emit).toHaveBeenCalledWith(
            SteamEventTypes.GameLoaded,
            expect.objectContaining({
                game: expect.objectContaining({
                    appid: 730,
                    name: 'Counter-Strike 2'
                }),
                timestamp: expect.any(Number),
                source: 'system'
            })
        )
    })
})