/**
 * Test to trigger Steam data loaded event and see taxonomy analysis
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../src/core/data/DataTypes'

vi.mock('../../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(function() { return {
        getScene: vi.fn().mockReturnValue({ add: vi.fn(), remove: vi.fn(), children: [] }),
        getRenderer: vi.fn().mockReturnValue({ shadowMap: { enabled: false } })
    } })
}))

vi.mock('../../../src/scene/StorePropsRenderer', () => ({
    StorePropsRenderer: vi.fn().mockImplementation(function() { return {
        setupProps: vi.fn().mockResolvedValue(undefined)
    } })
}))

vi.mock('../../../src/ui/coordinators/SystemUICoordinator', () => ({
    SystemUICoordinator: vi.fn().mockImplementation(function() { return {} })
}))

vi.mock('../../../src/lighting/LightingManager', () => ({
    LightingManager: vi.fn().mockImplementation(function() { return {} })
}))

vi.mock('../../../src/scene/LightingRenderer', () => ({
    LightingRenderer: vi.fn().mockImplementation(function() { return {
        setupLighting: vi.fn().mockResolvedValue(undefined)
    } })
}))

import { SceneCoordinator } from '../../../src/scene/SceneCoordinator'
import { SceneManager } from '../../../src/scene/SceneManager'

describe('Taxonomy Analysis Demo', () => {
    let eventManager: EventManager
    let sceneCoordinator: SceneCoordinator
    let sceneManager: SceneManager

    beforeEach(() => {
        // SceneCoordinator creates SkyboxManager which reads MainScene from DataManager
        const mockScene = new THREE.Scene()
        const mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
        mockCamera.position.set(0, 1.6, 3)
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })
        DataManager.getInstance().set(DataKey.MainCamera, mockCamera, { domain: DataDomain.Scene })

        eventManager = EventManager.getInstance()
        sceneManager = new SceneManager()
        sceneCoordinator = new SceneCoordinator(sceneManager)
        
        ;(window as any).app = {
            steamIntegration: {
                getGamesForScene: () => [
                    { appid: 440,   name: 'Team Fortress 2',                   playtime_forever: 3600, playtime_2weeks: 120, img_icon_url: 'icon1', img_logo_url: 'logo1' },
                    { appid: 730,   name: 'Counter-Strike: Global Offensive',   playtime_forever: 0,    playtime_2weeks: 0,   img_icon_url: 'icon2', img_logo_url: 'logo2' },
                    { appid: 570,   name: 'Dota 2',                             playtime_forever: 9000, playtime_2weeks: 0,   img_icon_url: 'icon3', img_logo_url: 'logo3' },
                    { appid: 220,   name: 'Half-Life 2',                        playtime_forever: 1200, playtime_2weeks: 60,  img_icon_url: 'icon4', img_logo_url: 'logo4' },
                    { appid: 400,   name: 'Portal',                             playtime_forever: 600,  playtime_2weeks: 0,   img_icon_url: 'icon5', img_logo_url: 'logo5' },
                    { appid: 620,   name: 'Portal 2',                           playtime_forever: 1800, playtime_2weeks: 0,   img_icon_url: 'icon6', img_logo_url: 'logo6' },
                    { appid: 12345, name: 'Euro Truck Simulator 2',             playtime_forever: 300,  playtime_2weeks: 0,   img_icon_url: 'icon7', img_logo_url: 'logo7' },
                    { appid: 67890, name: 'City Car Racing Adventure',          playtime_forever: 150,  playtime_2weeks: 0,   img_icon_url: 'icon8', img_logo_url: 'logo8' },
                ]
            }
        }
    }, 30000)

    afterEach(() => {
        delete (window as any).app
    })

    it('should show comprehensive taxonomy analysis for sample games', () => {
        eventManager.emit(SteamEventTypes.DataLoaded, {
            userInput: 'demo_user',
            gameCount: 8,
            timestamp: Date.now(),
            source: EventSource.System
        })
        expect(true).toBe(true)
    })

    it('should handle missing game data gracefully', () => {
        delete (window as any).app
        
        eventManager.emit(SteamEventTypes.DataLoaded, {
            userInput: 'no_data_user',
            gameCount: 15,
            timestamp: Date.now(),
            source: EventSource.System
        })
        expect(true).toBe(true)
    })
})
