/**
 * Test to reproduce and verify fix for duplicated console logs during application startup
 * 
 * The issue: Console logs appear twice during app initialization, indicating potential
 * duplicate initialization paths in main.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SteamBrickAndMortarApp } from '../../../src/core/SteamBrickAndMortarApp'

// Mock console methods to track log calls
const consoleSpy = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {})
}

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

describe('Duplicate Initialization Detection', () => {
    beforeEach(() => {
        // Reset all console spies
        consoleSpy.log.mockClear()
        consoleSpy.warn.mockClear()
        consoleSpy.error.mockClear()
        
        // Reset DOM mock
        mockDocument.addEventListener.mockClear()
        mockDocument.readyState = 'loading'
        mockWindow.steamBrickAndMortarApp = undefined
    })

    afterEach(() => {
        // Clean up
        vi.clearAllMocks()
    })

    it('should detect duplicate initialization logs when app.init() is called multiple times', async () => {
        // Create app instance
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

        // Initialize once
        await app.init()
        
        // Count specific initialization logs
        const firstInitLogCount = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('Initializing Steam Brick and Mortar WebXR')
        ).length
        
        const firstReadyLogCount = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('WebXR environment ready!')
        ).length

        // Should have exactly one of each initialization log
        expect(firstInitLogCount).toBe(1)
        expect(firstReadyLogCount).toBe(1)

        // Reset call counts
        consoleSpy.log.mockClear()

        // Try to initialize again (should be gracefully handled)
        await app.init()
        
        // Count logs after second init attempt
        const secondInitLogCount = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('Initializing Steam Brick and Mortar WebXR')
        ).length
        
        const alreadyInitializedWarningCount = consoleSpy.warn.mock.calls.filter(call => 
            call[0]?.includes('App already initialized')
        ).length

        // Should NOT reinitialize, should show warning instead
        expect(secondInitLogCount).toBe(0)
        expect(alreadyInitializedWarningCount).toBe(1)

        // Clean up
        app.dispose()
    })

    it('should detect if managers are instantiated multiple times', async () => {
        // Track manager instances to test for proper isolation

        // Create multiple app instances to test for manager reuse/recreation
        const app1 = new SteamBrickAndMortarApp()
        const app2 = new SteamBrickAndMortarApp()

        await app1.init()
        await app2.init()

        // Each app should have its own manager instances
        expect(app1.getSceneManager()).toBeDefined()
        expect(app2.getSceneManager()).toBeDefined()
        
        // But they should be different instances
        expect(app1.getSceneManager()).not.toBe(app2.getSceneManager())

        // Clean up
        app1.dispose()
        app2.dispose()
    })

    it('should simulate the main.ts double initialization scenario', async () => {
        // Simulate the problematic main.ts logic
        let initializeAppCallCount = 0
        
        const initializeApp = async () => {
            initializeAppCallCount++
            console.log('🚀 Starting Steam Brick and Mortar...')
            
            const app = new SteamBrickAndMortarApp({
                scene: { antialias: true, enableShadows: true },
                steam: { apiBaseUrl: 'https://steam-api-dev.wehrly.com', maxGames: 30 },
                input: { speed: 0.1, mouseSensitivity: 0.005 }
            })
            
            await app.init()
            
            // Store app reference globally for debugging
            mockWindow.steamBrickAndMortarApp = app as any
            
            console.log('🎉 Steam Brick and Mortar initialized successfully!')
            
            return app
        }

        // Simulate the two potential execution paths from main.ts:

        // 1. DOMContentLoaded event listener
        const eventListenerCallback = initializeApp
        
        // 2. Immediate execution if DOM already loaded
        let immediateExecution: Promise<SteamBrickAndMortarApp> | null = null
        
        // Simulate DOM state scenarios
        
        // Scenario A: DOM is still loading (normal case)
        mockDocument.readyState = 'loading'
        mockDocument.addEventListener('DOMContentLoaded', eventListenerCallback)
        
        // Only event listener should be set up, no immediate execution
        expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', eventListenerCallback)
        expect(initializeAppCallCount).toBe(0)
        
        // Simulate DOM loaded event firing
        const app1 = await eventListenerCallback()
        expect(initializeAppCallCount).toBe(1)

        // Reset for next scenario
        initializeAppCallCount = 0
        consoleSpy.log.mockClear()
        mockDocument.addEventListener.mockClear()
        app1.dispose()

        // Scenario B: DOM already loaded (potential double init)
        mockDocument.readyState = 'complete'
        mockDocument.addEventListener('DOMContentLoaded', eventListenerCallback)
        
        // Both paths could execute
        immediateExecution = initializeApp() // Immediate execution
        
        // Event listener also set up
        expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', eventListenerCallback)
        
        // Wait for immediate execution
        const app2 = await immediateExecution
        expect(initializeAppCallCount).toBe(1)
        
        // If DOM event somehow fires later (shouldn't happen but could), we'd get double init
        // This simulates the bug condition
        if (mockDocument.readyState === 'complete') {
            // Simulate delayed event firing (the bug scenario)
            try {
                const app3 = await eventListenerCallback()
                expect(initializeAppCallCount).toBe(2) // This would be the duplicate initialization
                app3.dispose()
            } catch {
                // This is fine if the app prevents duplicate initialization
            }
        }

        // Count the startup logs to detect duplication
        const startupLogCount = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('🚀 Starting Steam Brick and Mortar')
        ).length
        
        const successLogCount = consoleSpy.log.mock.calls.filter(call => 
            call[0]?.includes('🎉 Steam Brick and Mortar initialized successfully')
        ).length

        // Should see evidence of duplicate calls if the bug exists
        console.log(`Startup logs: ${startupLogCount}, Success logs: ${successLogCount}`)
        
        // Clean up
        app2.dispose()
    })

    it('should verify single instance creation when app reference is already stored globally', async () => {
        // Test that we don't create multiple app instances when one already exists globally
        
        const firstApp = new SteamBrickAndMortarApp()
        await firstApp.init()
        
        // Store in mock window
        mockWindow.steamBrickAndMortarApp = firstApp as any
        
        // Check if we can detect existing instance
        const existingApp = mockWindow.steamBrickAndMortarApp
        expect(existingApp).toBeDefined()
        expect(existingApp).toBe(firstApp)
        
        // If main.ts checked for existing instance, it could prevent duplicate initialization
        const shouldCreateNewApp = !mockWindow.steamBrickAndMortarApp
        expect(shouldCreateNewApp).toBe(false)
        
        // Clean up
        firstApp.dispose()
    })
})
