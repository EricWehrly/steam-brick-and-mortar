/**
 * Test application initialization behavior without coupling to log messages
 * 
 * Focus: Verify that initialization works correctly and handles edge cases,
 * not testing throwaway console output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SteamBrickAndMortarApp } from '../../../src/core/SteamBrickAndMortarApp'

// Mock all dependencies
vi.mock('../../../src/scene/SceneManager', async () => {
    const { sceneManagerMockFactory } = await import('../../mocks/scene/SceneManager.mock')
    return sceneManagerMockFactory()
})

vi.mock('../../../src/scene/AssetLoader', async () => {
    const { assetLoaderMockFactory } = await import('../../mocks/scene/AssetLoader.mock')
    return assetLoaderMockFactory()
})

vi.mock('../../../src/scene/GameBoxRenderer', async () => {
    const { gameBoxRendererMockFactory } = await import('../../mocks/scene/GameBoxRenderer.mock')
    return gameBoxRendererMockFactory()
})

vi.mock('../../../src/scene/SignageRenderer', async () => {
    const { signageRendererMockFactory } = await import('../../mocks/scene/SignageRenderer.mock')
    return signageRendererMockFactory()
})

vi.mock('../../../src/scene/StoreLayout', async () => {
    const { storeLayoutMockFactory } = await import('../../mocks/scene/StoreLayout.mock')
    return storeLayoutMockFactory()
})

vi.mock('../../../src/steam-integration/SteamIntegration', async () => {
    const { steamIntegrationMockFactory } = await import('../../mocks/steam-integration/SteamIntegration.mock')
    return steamIntegrationMockFactory()
})

vi.mock('../../../src/webxr/WebXRManager', async () => {
    const { webxrManagerMockFactory } = await import('../../mocks/webxr/WebXRManager.mock')
    return webxrManagerMockFactory()
})

vi.mock('../../../src/webxr/InputManager', async () => {
    const { inputManagerMockFactory } = await import('../../mocks/webxr/InputManager.mock')
    return inputManagerMockFactory()
})

vi.mock('../../../src/ui/UIManager', async () => {
    const { uiManagerMockFactory } = await import('../../mocks/ui/UIManager.mock')
    return uiManagerMockFactory()
})

vi.mock('../../../src/ui/CacheManagementUI', async () => {
    const { cacheManagementUIMockFactory } = await import('../../mocks/ui/CacheManagementUI.mock')
    return cacheManagementUIMockFactory()
})

describe('Application Initialization Behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should initialize successfully', async () => {
        const app = new SteamBrickAndMortarApp({
            scene: {
                antialias: false,
                enableShadows: false
            },
            steam: {
                apiBaseUrl: 'http://test-api.example.com',
                maxGames: 5
            },
            input: {
                speed: 0.2,
                mouseSensitivity: 0.01
            }
        })

        await expect(app.init()).resolves.not.toThrow()
        app.dispose()
    })

    it('should handle multiple initialization calls safely', async () => {
        const app = new SteamBrickAndMortarApp()
        
        // Multiple init calls should not cause issues
        await expect(app.init()).resolves.not.toThrow()
        await expect(app.init()).resolves.not.toThrow()
        await expect(app.init()).resolves.not.toThrow()
        
        app.dispose()
    })

    it('should allow reinitialization after disposal', async () => {
        const app = new SteamBrickAndMortarApp()

        // Initialize, dispose, then reinitialize
        await app.init()
        app.dispose()
        await expect(app.init()).resolves.not.toThrow()
        
        app.dispose()
    })

    it('should not reinitialize expensive operations on duplicate init calls', async () => {
        const app = new SteamBrickAndMortarApp()
        
        // Track method calls that should only happen once
        let sceneSetupCalls = 0
        let uiSetupCalls = 0
        
        const originalSetupScene = (app as any).setupScene?.bind(app)
        const originalSetupUI = (app as any).setupUI?.bind(app)
        
        if (originalSetupScene) {
            vi.spyOn(app as any, 'setupScene').mockImplementation(async (...args) => {
                sceneSetupCalls++
                return originalSetupScene(...args)
            })
        }
        
        if (originalSetupUI) {
            vi.spyOn(app as any, 'setupUI').mockImplementation(async (...args) => {
                uiSetupCalls++
                return originalSetupUI(...args)
            })
        }

        // Multiple init calls
        await app.init()
        await app.init()
        await app.init()

        // Expensive operations should not repeat
        if (originalSetupScene) {
            expect(sceneSetupCalls).toBeLessThanOrEqual(1)
        }
        if (originalSetupUI) {
            expect(uiSetupCalls).toBeLessThanOrEqual(1)
        }

        app.dispose()
    })
})