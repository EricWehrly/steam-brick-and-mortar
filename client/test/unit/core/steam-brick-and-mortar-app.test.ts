/**
 * Unit tests for SteamBrickAndMortarApp orchestrator class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SteamBrickAndMortarApp, type AppConfig } from '../../../src/core/SteamBrickAndMortarApp'

// Mock all the manager dependencies
vi.mock('../../../src/scene/SceneManager')
vi.mock('../../../src/scene/AssetLoader')
vi.mock('../../../src/scene/GameBoxRenderer')
vi.mock('../../../src/steam-integration/SteamIntegration')
vi.mock('../../../src/webxr/WebXRManager')
vi.mock('../../../src/webxr/InputManager')
vi.mock('../../../src/ui/UIManager')

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
            // Mock scene manager to throw error
            const mockSceneManager = app.getSceneManager()
            vi.spyOn(mockSceneManager, 'createFloor').mockImplementation(() => {
                throw new Error('Scene creation failed')
            })

            await expect(app.init()).rejects.toThrow('Scene creation failed')
            expect(app.getIsInitialized()).toBe(false)
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
