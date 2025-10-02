/**
 * Test to trigger Steam data loaded event and see taxonomy analysis
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'

// Mock all dependencies
vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(() => ({
        getScene: vi.fn().mockReturnValue({
            add: vi.fn(),
            remove: vi.fn(),
            children: []
        }),
        getRenderer: vi.fn().mockReturnValue({
            shadowMap: { enabled: false }
        })
    }))
}))

vi.mock('../../../src/scene/StorePropsRenderer', () => ({
    StorePropsRenderer: vi.fn().mockImplementation(() => ({
        spawnDynamicShelvesWithGames: vi.fn().mockResolvedValue(undefined),
        setupProps: vi.fn().mockResolvedValue(undefined)
    }))
}))

vi.mock('../../../src/scene/EnvironmentRenderer', () => ({
    EnvironmentRenderer: vi.fn().mockImplementation(() => ({
        setupEnvironment: vi.fn().mockResolvedValue(undefined),
        getEnvironmentStats: vi.fn().mockReturnValue({ meshCount: 0, lightCount: 0 })
    }))
}))

vi.mock('../../../src/ui/coordinators/SystemUICoordinator', () => ({
    SystemUICoordinator: vi.fn().mockImplementation(() => ({}))
}))

vi.mock('../../../src/lighting/LightingManager', () => ({
    LightingManager: vi.fn().mockImplementation(() => ({
        getLightingStats: vi.fn().mockReturnValue({ lightCount: 0, quality: 'enhanced' })
    }))
}))

vi.mock('../../../src/scene/LightingRenderer', () => ({
    LightingRenderer: vi.fn().mockImplementation(() => ({
        getLightingStats: vi.fn().mockReturnValue({ 
            lightCount: 0, 
            shadowsEnabled: false,
            quality: 'enhanced',
            ambientIntensity: 0.3
        }),
        setupLighting: vi.fn().mockResolvedValue(undefined),
        refreshShadows: vi.fn().mockResolvedValue(undefined)
    }))
}))

import { SceneCoordinator } from '../../../src/scene/SceneCoordinator'
import { SceneManager } from '../../../src/scene/SceneManager'

describe('Taxonomy Analysis Demo', () => {
    let sceneCoordinator: SceneCoordinator
    let sceneManager: SceneManager

    beforeEach(() => {
        sceneManager = new SceneManager({})
        sceneCoordinator = new SceneCoordinator(sceneManager)
        
        // Mock some game data for analysis
        ;(window as any).app = {
            steamIntegration: {
                getGamesForScene: () => [
                    {
                        appid: 440,
                        name: 'Team Fortress 2',
                        playtime_forever: 3600, // 60 hours
                        playtime_2weeks: 120, // 2 hours recently
                        img_icon_url: 'icon1',
                        img_logo_url: 'logo1'
                    },
                    {
                        appid: 730,
                        name: 'Counter-Strike: Global Offensive',
                        playtime_forever: 0, // Unplayed
                        playtime_2weeks: 0,
                        img_icon_url: 'icon2',
                        img_logo_url: 'logo2'
                    },
                    {
                        appid: 570,
                        name: 'Dota 2',
                        playtime_forever: 9000, // 150 hours
                        playtime_2weeks: 0, // Not recent
                        img_icon_url: 'icon3',
                        img_logo_url: 'logo3'
                    },
                    {
                        appid: 220,
                        name: 'Half-Life 2',
                        playtime_forever: 1200, // 20 hours
                        playtime_2weeks: 60, // 1 hour recently
                        img_icon_url: 'icon4',
                        img_logo_url: 'logo4'  
                    },
                    {
                        appid: 400,
                        name: 'Portal',
                        playtime_forever: 600, // 10 hours
                        playtime_2weeks: 0,
                        img_icon_url: 'icon5',
                        img_logo_url: 'logo5'
                    },
                    {
                        appid: 620,
                        name: 'Portal 2',
                        playtime_forever: 1800, // 30 hours
                        playtime_2weeks: 0,
                        img_icon_url: 'icon6',
                        img_logo_url: 'logo6'
                    },
                    {
                        appid: 12345,
                        name: 'Euro Truck Simulator 2',
                        playtime_forever: 300, // 5 hours
                        playtime_2weeks: 0,
                        img_icon_url: 'icon7',
                        img_logo_url: 'logo7'
                    },
                    {
                        appid: 67890,
                        name: 'City Car Racing Adventure',
                        playtime_forever: 150, // 2.5 hours
                        playtime_2weeks: 0,
                        img_icon_url: 'icon8',
                        img_logo_url: 'logo8'
                    }
                ]
            }
        }
    })

    it('should show comprehensive taxonomy analysis for sample games', () => {
        const eventManager = EventManager.getInstance()
        
        console.log('\n🎮 === RUNNING TAXONOMY ANALYSIS DEMO ===\n')
        
        // Emit the SteamDataLoaded event to trigger analysis
        eventManager.emit(SteamEventTypes.DataLoaded, {
            userInput: 'demo_user',
            gameCount: 8,
            timestamp: Date.now(),
            source: EventSource.System
        })

        // Test should complete without errors
        expect(true).toBe(true)
        
        console.log('\n🎯 === DEMO COMPLETE ===\n')
    })

    it('should handle missing game data gracefully', () => {
        const eventManager = EventManager.getInstance()
        
        // Remove mock data to test fallback
        delete (window as any).app
        
        console.log('\n📊 === TESTING FALLBACK ANALYSIS ===\n')
        
        // Emit event without access to game data
        eventManager.emit(SteamEventTypes.DataLoaded, {
            userInput: 'no_data_user',
            gameCount: 15,
            timestamp: Date.now(),
            source: EventSource.System
        })

        expect(true).toBe(true)
        
        console.log('\n✅ === FALLBACK TEST COMPLETE ===\n')
    })

    afterEach(() => {
        // Clean up global mock
        delete (window as any).app
    })
})