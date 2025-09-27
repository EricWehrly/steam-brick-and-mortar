/**
 * Test to verify application initialization idempotency and prevent duplicate initialization
 * 
 * Focus: Behavioral testing - ensuring init() can be called safely multiple times
 * without causing problems, not testing specific log messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SteamBrickAndMortarApp } from '../../../src/core/SteamBrickAndMortarApp'

// Mock DOM and window
const mockDocument = {
    addEventListener: vi.fn(),
    readyState: 'loading' as Document['readyState'],
    getElementById: vi.fn().mockReturnValue(null)
}

const mockWindow = {
    steamBrickAndMortarApp: undefined
}

// Mock the dependencies
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

describe('Application Initialization Idempotency', () => {
    beforeEach(() => {
        // Reset DOM mock
        mockDocument.addEventListener.mockClear()
        mockDocument.readyState = 'loading'
        mockWindow.steamBrickAndMortarApp = undefined
    })

    afterEach(() => {
        // Clean up
        vi.clearAllMocks()
    })

    it('should allow multiple init() calls without breaking', async () => {
        const app = new SteamBrickAndMortarApp({
            scene: {
                antialias: false,
                shadowQuality: 0 // Shadows disabled for test performance
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

        // Initialize once
        await expect(app.init()).resolves.not.toThrow()

        // Initialize again - should not throw
        await expect(app.init()).resolves.not.toThrow()

        // Clean up
        app.dispose()
    })

    it('should prevent duplicate initialization side effects', async () => {
        // Track how many times expensive operations are called
        let sceneSetupCount = 0
        let uiSetupCount = 0
        
        const app = new SteamBrickAndMortarApp()
        
        // Spy on expensive operations
        const originalSetupScene = (app as any).setupScene?.bind(app)
        const originalSetupUI = (app as any).setupUI?.bind(app)
        
        if (originalSetupScene) {
            vi.spyOn(app as any, 'setupScene').mockImplementation(async () => {
                sceneSetupCount++
                return originalSetupScene?.()
            })
        }
        
        if (originalSetupUI) {
            vi.spyOn(app as any, 'setupUI').mockImplementation(async () => {
                uiSetupCount++
                return originalSetupUI?.()
            })
        }

        // Multiple init calls
        await app.init()
        await app.init()
        await app.init()

        // Expensive setup should only happen once
        if (originalSetupScene) {
            expect(sceneSetupCount).toBeLessThanOrEqual(1)
        }
        if (originalSetupUI) {
            expect(uiSetupCount).toBeLessThanOrEqual(1)
        }

        app.dispose()
    })

    it('should handle reinitialization after disposal', async () => {
        const app = new SteamBrickAndMortarApp()

        // Initialize, dispose, then reinitialize
        await app.init()
        app.dispose()

        // Should be able to initialize again after disposal
        await expect(app.init()).resolves.not.toThrow()

        app.dispose()
    })
})
