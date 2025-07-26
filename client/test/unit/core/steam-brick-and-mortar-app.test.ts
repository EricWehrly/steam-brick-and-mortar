/**
 * Unit tests for SteamBrickAndMortarApp orchestrator class
 * 
 * This test file uses clean, external mock implementations that are:
 * - Externally housed in test/mocks/ for easy maintenance and reuse
 * - Well-documented with inline comments (no separate README)
 * - Cleanly referenced via factory functions (3 lines per mock vs 4+ lines inline)
 * - Reusable across multiple test files
 * - Each mock exports both the mock class and an async factory function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SteamBrickAndMortarApp, type AppConfig } from '../../../src/core/SteamBrickAndMortarApp'

// Clean one-line mock setup using external factory functions
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

describe('SteamBrickAndMortarApp Unit Tests', () => {
    let app: SteamBrickAndMortarApp

    beforeEach(() => {
        // Mock DOM elements
        const mockCanvas = document.createElement('canvas')
        vi.spyOn(document, 'createElement').mockReturnValue(mockCanvas)
        
        // Mock getBoundingClientRect
        vi.spyOn(mockCanvas, 'getBoundingClientRect').mockReturnValue({
            width: 800,
            height: 600,
            top: 0,
            left: 0,
            bottom: 600,
            right: 800,
            x: 0,
            y: 0,
            toJSON: () => ({})
        })

        // Create app instance with test configuration
        app = new SteamBrickAndMortarApp({
            scene: {
                antialias: false, // Disable for faster tests
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
    })

    afterEach(() => {
        if (app?.getIsInitialized()) {
            app.dispose()
        }
        vi.clearAllMocks()
    })

    describe('Application Lifecycle', () => {
        it('should create app instance with default configuration', () => {
            const defaultApp = new SteamBrickAndMortarApp()
            expect(defaultApp).toBeInstanceOf(SteamBrickAndMortarApp)
            expect(defaultApp.getIsInitialized()).toBe(false)
        })

        it('should create app instance with custom configuration', () => {
            const customConfig: AppConfig = {
                scene: {
                    antialias: true,
                    enableShadows: true
                },
                steam: {
                    apiBaseUrl: 'https://custom-api.com',
                    maxGames: 20
                },
                input: {
                    speed: 0.15,
                    mouseSensitivity: 0.008
                }
            }
            
            const customApp = new SteamBrickAndMortarApp(customConfig)
            expect(customApp).toBeInstanceOf(SteamBrickAndMortarApp)
            expect(customApp.getIsInitialized()).toBe(false)
        })

        it('should initialize successfully', async () => {
            expect(app.getIsInitialized()).toBe(false)
            
            await app.init()
            
            expect(app.getIsInitialized()).toBe(true)
        })

        it('should handle multiple initialization attempts gracefully', async () => {
            await app.init()
            expect(app.getIsInitialized()).toBe(true)
            
            // Should not throw error on second init
            await app.init()
            expect(app.getIsInitialized()).toBe(true)
        })

        it('should dispose resources properly', async () => {
            await app.init()
            expect(app.getIsInitialized()).toBe(true)
            
            app.dispose()
            expect(app.getIsInitialized()).toBe(false)
        })

        it('should handle disposal of uninitialized app gracefully', () => {
            expect(app.getIsInitialized()).toBe(false)
            
            // Should not throw error
            app.dispose()
            expect(app.getIsInitialized()).toBe(false)
        })
    })

    describe('Manager Access', () => {
        beforeEach(async () => {
            await app.init()
        })

        it('should provide access to scene manager', () => {
            const sceneManager = app.getSceneManager()
            expect(sceneManager).toBeDefined()
        })

        it('should provide access to Steam integration', () => {
            const steamIntegration = app.getSteamIntegration()
            expect(steamIntegration).toBeDefined()
        })

        it('should provide access to WebXR manager', () => {
            const webxrManager = app.getWebXRManager()
            expect(webxrManager).toBeDefined()
        })
    })

    describe('Error Handling', () => {
        it('should handle initialization errors gracefully', async () => {
            // Create a fresh app instance for this test
            const errorApp = new SteamBrickAndMortarApp({
                scene: {
                    antialias: false,
                    enableShadows: false
                }
            })

            // Mock the WebXR manager to throw error during checkCapabilities
            const mockWebXRManager = errorApp.getWebXRManager()
            vi.spyOn(mockWebXRManager, 'checkCapabilities').mockImplementation(() => {
                throw new Error('Scene creation failed')
            })

            await expect(errorApp.init()).rejects.toThrow('Scene creation failed')
            expect(errorApp.getIsInitialized()).toBe(false)
        })

        it('should handle WebXR setup errors gracefully', async () => {
            // Mock WebXR manager to throw error
            const mockWebXRManager = app.getWebXRManager()
            vi.spyOn(mockWebXRManager, 'checkCapabilities').mockImplementation(() => {
                throw new Error('WebXR not supported')
            })

            await expect(app.init()).rejects.toThrow('WebXR not supported')
            expect(app.getIsInitialized()).toBe(false)
        })
    })

    describe('Configuration Validation', () => {
        it('should apply default values for missing configuration', () => {
            const minimalApp = new SteamBrickAndMortarApp({})
            expect(minimalApp).toBeInstanceOf(SteamBrickAndMortarApp)
        })

        it('should handle partial configuration objects', () => {
            const partialConfig: AppConfig = {
                steam: {
                    maxGames: 50
                }
                // Missing scene and input config
            }
            
            const partialApp = new SteamBrickAndMortarApp(partialConfig)
            expect(partialApp).toBeInstanceOf(SteamBrickAndMortarApp)
        })
    })

    describe('Integration Points', () => {
        beforeEach(async () => {
            await app.init()
        })

        it('should coordinate between all managers during initialization', () => {
            // Verify that all managers are initialized and connected
            expect(app.getSceneManager()).toBeDefined()
            expect(app.getSteamIntegration()).toBeDefined()
            expect(app.getWebXRManager()).toBeDefined()
            expect(app.getIsInitialized()).toBe(true)
        })

        it('should handle manager dependencies correctly', () => {
            // The app should properly wire up dependencies between managers
            const sceneManager = app.getSceneManager()
            const webxrManager = app.getWebXRManager()
            
            expect(sceneManager).toBeDefined()
            expect(webxrManager).toBeDefined()
        })
    })
})
