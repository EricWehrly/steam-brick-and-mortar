/**
 * Simple test to reproduce the duplicate console logs issue
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SteamBrickAndMortarApp } from '../../../src/core/SteamBrickAndMortarApp'

// Mock console to capture log calls
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

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

describe('Console Log Duplication Issue', () => {
    beforeEach(() => {
        consoleLogSpy.mockClear()
        consoleWarnSpy.mockClear()
    })

    it('should show clean single console output during app initialization', async () => {
        const app = new SteamBrickAndMortarApp({
            scene: { antialias: false, enableShadows: false },
            steam: { apiBaseUrl: 'http://test.com', maxGames: 5 },
            input: { speed: 0.1, mouseSensitivity: 0.01 }
        })

        // Initialize the app
        await app.init()

        // Count specific initialization messages
        const allLogCalls = consoleLogSpy.mock.calls.map(call => call[0])
        
        console.log('All console.log calls:', allLogCalls)
        
        // Check for duplicated messages
        const logCounts = new Map<string, number>()
        allLogCalls.forEach(log => {
            if (typeof log === 'string') {
                logCounts.set(log, (logCounts.get(log) || 0) + 1)
            }
        })

        // Find any duplicated logs
        const duplicatedLogs = Array.from(logCounts.entries()).filter(([, count]) => count > 1)
        
        if (duplicatedLogs.length > 0) {
            console.log('Found duplicated logs:')
            duplicatedLogs.forEach(([message, count]) => {
                console.log(`  "${message}" appeared ${count} times`)
            })
        }

        // The test should pass if there are no duplicated logs
        expect(duplicatedLogs.length).toBe(0)

        // Check for specific initialization messages that should appear exactly once
        const initMessages = allLogCalls.filter(log => 
            typeof log === 'string' && log.includes('Initializing Steam Brick and Mortar WebXR')
        )
        const readyMessages = allLogCalls.filter(log => 
            typeof log === 'string' && log.includes('WebXR environment ready!')
        )

        expect(initMessages.length).toBe(1)
        expect(readyMessages.length).toBe(1)

        app.dispose()
    })

    it('should gracefully handle multiple init attempts without duplicate logs', async () => {
        const app = new SteamBrickAndMortarApp()

        // First initialization
        await app.init()
        
        const firstInitCount = consoleLogSpy.mock.calls.filter(call => 
            call[0] && typeof call[0] === 'string' && call[0].includes('Initializing Steam Brick and Mortar WebXR')
        ).length

        expect(firstInitCount).toBe(1)

        // Clear console spy for second attempt
        consoleLogSpy.mockClear()
        consoleWarnSpy.mockClear()

        // Second initialization attempt (should be prevented)
        await app.init()
        
        const secondInitCount = consoleLogSpy.mock.calls.filter(call => 
            call[0] && typeof call[0] === 'string' && call[0].includes('Initializing Steam Brick and Mortar WebXR')
        ).length

        const warningCount = consoleWarnSpy.mock.calls.filter(call => 
            call[0] && typeof call[0] === 'string' && call[0].includes('App already initialized')
        ).length

        // Should not reinitialize, should show warning
        expect(secondInitCount).toBe(0)
        expect(warningCount).toBe(1)

        app.dispose()
    })

    it('should demonstrate the main.ts issue - potential for duplicate calls', async () => {
        // Simulate what could happen in main.ts if both code paths execute
        const createAndInitApp = async () => {
            const app = new SteamBrickAndMortarApp({
                scene: { antialias: true, enableShadows: true },
                steam: { apiBaseUrl: 'https://steam-api-dev.wehrly.com', maxGames: 30 },
                input: { speed: 0.1, mouseSensitivity: 0.005 }
            })
            await app.init()
            return app
        }

        // First call (immediate execution when DOM already loaded)
        const app1 = await createAndInitApp()
        
        const firstCallLogs = consoleLogSpy.mock.calls.length
        
        // Clear logs
        consoleLogSpy.mockClear()
        
        // Second call (DOMContentLoaded event firing - this would be the duplicate)
        const app2 = await createAndInitApp()
        
        const secondCallLogs = consoleLogSpy.mock.calls.length
        
        console.log(`First app init: ${firstCallLogs} log calls`)
        console.log(`Second app init: ${secondCallLogs} log calls`)
        
        // This demonstrates that without proper protection, we get duplicate initialization
        // The fix in main.ts should prevent this second app from being created
        expect(firstCallLogs).toBeGreaterThan(0)
        expect(secondCallLogs).toBeGreaterThan(0) // This shows the duplication issue

        app1.dispose()
        app2.dispose()
    })
})
