/**
 * Integration test to ensure the application starts up without errors
 * This test specifically covers the startup sequence that was failing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock external dependencies that would prevent startup in test environment
vi.mock('three', () => ({
    WebGLRenderer: vi.fn().mockImplementation(() => ({
        setSize: vi.fn(),
        setClearColor: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
        domElement: document.createElement('canvas')
    })),
    Scene: vi.fn(),
    PerspectiveCamera: vi.fn(),
    Color: vi.fn()
}))

vi.mock('../../src/webxr/WebXRManager', () => ({
    WebXRManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        dispose: vi.fn(),
        checkWebXRSupport: vi.fn().mockResolvedValue({ supportsImmersiveVR: false }),
        getCapabilities: vi.fn().mockReturnValue({ supportsImmersiveVR: false }),
        isSessionActive: vi.fn().mockReturnValue(false)
    }))
}))

vi.mock('../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(() => ({
        init: vi.fn(),
        dispose: vi.fn(),
        getRenderer: vi.fn().mockReturnValue({
            setSize: vi.fn(),
            setClearColor: vi.fn(),
            render: vi.fn(),
            dispose: vi.fn(),
            info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
            domElement: document.createElement('canvas')
        }),
        getScene: vi.fn(),
        getCamera: vi.fn()
    }))
}))

// Mock DOM elements
Object.defineProperty(globalThis, 'document', {
    value: {
        getElementById: vi.fn().mockReturnValue({
            style: {},
            classList: { add: vi.fn(), remove: vi.fn() },
            addEventListener: vi.fn(),
            appendChild: vi.fn(),
            remove: vi.fn()
        }),
        createElement: vi.fn().mockReturnValue({
            style: {},
            classList: { add: vi.fn(), remove: vi.fn() },
            addEventListener: vi.fn(),
            appendChild: vi.fn(),
            remove: vi.fn()
        }),
        body: {
            appendChild: vi.fn()
        }
    },
    writable: true
})

Object.defineProperty(globalThis, 'window', {
    value: {
        innerWidth: 1024,
        innerHeight: 768,
        addEventListener: vi.fn(),
        requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16))
    },
    writable: true
})

describe('Application Startup Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should create SteamWorkflowManager without binding errors', async () => {
        // Import components that were failing during startup
        const { SteamWorkflowManager } = await import('../../src/steam-integration/SteamWorkflowManager')
        const { SteamIntegration } = await import('../../src/steam-integration/SteamIntegration')
        const { UICoordinator } = await import('../../src/ui/UICoordinator')
        const { PerformanceMonitor } = await import('../../src/ui/PerformanceMonitor')
        const { EventManager } = await import('../../src/core/EventManager')

        // Create mock dependencies
        const mockEventManager = EventManager.getInstance()
        const mockSteamIntegration = new SteamIntegration()
        const mockSteamGameManager = {
            loadGames: vi.fn(),
            dispose: vi.fn()
        } as any
        
        const mockPerformanceMonitor = new PerformanceMonitor({
            updateInterval: 1000,
            showMemory: true
        })
        
        const mockDebugStatsProvider = {
            getDebugStats: vi.fn().mockResolvedValue({
                sceneObjects: { total: 0, meshes: 0, lights: 0, cameras: 0, textures: 0, materials: 0, geometries: 0 },
                performance: { fps: 60, frameTime: 16, memoryUsed: 1024000, memoryTotal: 2048000, triangles: 1000, drawCalls: 50 },
                cache: { imageCount: 0, imageCacheSize: 0, gameDataCount: 0, gameDataSize: 0, quotaUsed: 0, quotaTotal: 0 },
                system: { userAgent: 'test', webxrSupported: true, webglVersion: 'WebGL 2.0', maxTextureSize: 4096, vendor: 'test', renderer: 'test' }
            })
        } as any
        
        const mockUICoordinator = new UICoordinator(
            mockPerformanceMonitor,
            mockDebugStatsProvider,
            () => mockSteamIntegration.getImageCacheStats()
        )

        // This should not throw the "Cannot read properties of undefined (reading 'bind')" error
        expect(() => {
            new SteamWorkflowManager(
                mockEventManager,
                mockSteamIntegration,
                mockUICoordinator
            )
        }).not.toThrow()
    })

    it('should create SteamBrickAndMortarApp without startup errors', async () => {
        // Import the main app class
        const { SteamBrickAndMortarApp } = await import('../../src/core/SteamBrickAndMortarApp')
        
        // This should not throw any startup errors
        expect(() => {
            new SteamBrickAndMortarApp({
                steam: {
                    maxGames: 30,
                    apiBaseUrl: 'https://steam-api-dev.wehrly.com'
                }
            })
        }).not.toThrow()
    })

    it('should handle UICoordinator cache stats provider integration', async () => {
        const { UICoordinator } = await import('../../src/ui/UICoordinator')
        const { PerformanceMonitor } = await import('../../src/ui/PerformanceMonitor')
        
        const mockPerformanceMonitor = new PerformanceMonitor({
            updateInterval: 1000,
            showMemory: true
        })
        
        const mockDebugStatsProvider = {
            getDebugStats: vi.fn().mockResolvedValue({
                sceneObjects: { total: 0, meshes: 0, lights: 0, cameras: 0, textures: 0, materials: 0, geometries: 0 },
                performance: { fps: 60, frameTime: 16, memoryUsed: 1024000, memoryTotal: 2048000, triangles: 1000, drawCalls: 50 },
                cache: { imageCount: 0, imageCacheSize: 0, gameDataCount: 0, gameDataSize: 0, quotaUsed: 0, quotaTotal: 0 },
                system: { userAgent: 'test', webxrSupported: true, webglVersion: 'WebGL 2.0', maxTextureSize: 4096, vendor: 'test', renderer: 'test' }
            })
        } as any
        
        const mockCacheStatsProvider = vi.fn().mockResolvedValue({
            totalImages: 10,
            totalSize: 1024 * 1024,
            oldestTimestamp: Date.now() - 1000,
            newestTimestamp: Date.now()
        })

        // UICoordinator should accept the cache stats provider
        expect(() => {
            new UICoordinator(
                mockPerformanceMonitor,
                mockDebugStatsProvider,
                mockCacheStatsProvider
            )
        }).not.toThrow()

        // UICoordinator should work without cache stats provider
        expect(() => {
            new UICoordinator(
                mockPerformanceMonitor,
                mockDebugStatsProvider
            )
        }).not.toThrow()
    })
})
