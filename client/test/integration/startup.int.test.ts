/**
 * Integration test to ensure the application starts up without errors
 * This test specifically covers the startup sequence that was failing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.performance before importing any modules that use it
Object.defineProperty(window, 'performance', {
  value: {
    now: () => Date.now(),
    mark: () => {},
    measure: () => {},
    getEntriesByType: () => [],
    getEntriesByName: () => [],
    clearMarks: () => {},
    clearMeasures: () => {}
  },
  writable: true
})

// Also mock on globalThis
Object.defineProperty(globalThis, 'performance', {
  value: {
    now: () => Date.now(),
    mark: () => {},
    measure: () => {},
    getEntriesByType: () => [],
    getEntriesByName: () => [],
    clearMarks: () => {},
    clearMeasures: () => {}
  },
  writable: true
})

// Mock external dependencies that would prevent startup in test environment
vi.mock('three', async (importOriginal) => {
    const actual: any = await importOriginal()
    return {
        ...actual,
    WebGLRenderer: vi.fn().mockImplementation(() => ({
        setSize: vi.fn(),
        setClearColor: vi.fn(),
        render: vi.fn(),
        dispose: vi.fn(),
        setPixelRatio: vi.fn(),
        info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 } },
        domElement: document.createElement('canvas'),
        shadowMap: {
            enabled: false,
            type: 1 // Mock shadow map type
        },
        xr: {
            enabled: false
        },
        outputColorSpace: 'srgb',
        capabilities: {
            isWebGL2: true,
            maxTextureSize: 4096
        },
        getContext: vi.fn().mockReturnValue({
            getParameter: vi.fn().mockReturnValue('Mock WebGL')
        }),
        debug: {
            checkShaderErrors: false
        }
    })),
    Scene: vi.fn().mockImplementation(() => ({
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        traverse: vi.fn(),
        getObjectByName: vi.fn(),
        userData: {},
        background: null
    })),
    PerspectiveCamera: vi.fn().mockImplementation(() => ({
        position: { set: vi.fn() },
        lookAt: vi.fn(),
        aspect: 1,
        updateProjectionMatrix: vi.fn()
    })),
    Color: vi.fn(),
    // Shadow map constants
    PCFSoftShadowMap: 1,
    PCFShadowMap: 2,
    VSMShadowMap: 3,
    BasicShadowMap: 0,
    // Color space constants
    SRGBColorSpace: 'srgb',
    LinearSRGBColorSpace: 'srgb-linear',
    // Other commonly used Three.js exports
    Mesh: vi.fn().mockImplementation(() => ({
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        rotation: { x: 0, y: 0, z: 0, set: vi.fn() },
        scale: { x: 1, y: 1, z: 1, set: vi.fn() },
        material: null,
        geometry: null,
        userData: {}
    })),
    Group: vi.fn().mockImplementation(() => ({
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        rotation: { x: 0, y: 0, z: 0, set: vi.fn() },
        scale: { x: 1, y: 1, z: 1, set: vi.fn() },
        userData: {}
    })),
    Material: vi.fn(),
    MeshStandardMaterial: vi.fn(),
    BoxGeometry: vi.fn(),
    PlaneGeometry: vi.fn(),
    Vector3: vi.fn(),
    Euler: vi.fn(),
    Light: vi.fn().mockImplementation(() => ({
        position: { set: vi.fn() },
        castShadow: false
    })),
    DirectionalLight: vi.fn().mockImplementation(() => ({
        position: { set: vi.fn() },
        castShadow: false,
        shadow: {
            mapSize: { width: 1024, height: 1024 },
            camera: {
                near: 1,
                far: 100,
                left: -50,
                right: 50,
                top: 50,
                bottom: -50
            }
        }
    })),
    AmbientLight: vi.fn().mockImplementation(() => ({
        intensity: 1
    })),
    Camera: vi.fn(),
    Object3D: vi.fn(),
    TextureLoader: vi.fn().mockImplementation(() => ({
        load: vi.fn(),
        setPath: vi.fn(),
        setCrossOrigin: vi.fn()
    })),
    Texture: vi.fn()
    }
})

vi.mock('../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitor: vi.fn().mockImplementation(() => ({
        getStats: vi.fn().mockReturnValue({
            fps: 60,
            frameTime: 16.7,
            memoryUsed: 1024,
            memoryTotal: 2048
        }),
        dispose: vi.fn(),
        hide: vi.fn(),
        show: vi.fn(),
        update: vi.fn()
    }))
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
        getScene: vi.fn().mockReturnValue({
            add: vi.fn(),
            remove: vi.fn(),
            children: [],
            traverse: vi.fn(),
            getObjectByName: vi.fn(),
            userData: {},
            background: null
        }),
        getCamera: vi.fn().mockReturnValue({
            position: { set: vi.fn() },
            lookAt: vi.fn(),
            aspect: 1,
            updateProjectionMatrix: vi.fn()
        })
    }))
}))

vi.mock('../../src/scene/StoreLayout', () => ({
    StoreLayout: vi.fn().mockImplementation(() => ({
        createDefaultLayout: vi.fn().mockReturnValue({}),
        dispose: vi.fn()
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
        createElement: vi.fn().mockImplementation((tagName) => {
            const element: any = {
                style: {},
                classList: { add: vi.fn(), remove: vi.fn() },
                addEventListener: vi.fn(),
                appendChild: vi.fn(),
                remove: vi.fn(),
                width: 512,
                height: 512
            }
            
            // Add specific methods for canvas elements
            if (tagName === 'canvas') {
                element.getContext = vi.fn().mockReturnValue({
                    fillStyle: '#000000',
                    fillRect: vi.fn(),
                    clearRect: vi.fn(),
                    fillText: vi.fn(),
                    measureText: vi.fn().mockReturnValue({ width: 100 }),
                    drawImage: vi.fn(),
                    font: '16px Arial',
                    textAlign: 'center',
                    textBaseline: 'middle',
                    createImageData: vi.fn().mockReturnValue({
                        data: new Uint8ClampedArray(4)
                    }),
                    putImageData: vi.fn(),
                    getImageData: vi.fn().mockReturnValue({
                        data: new Uint8ClampedArray(4),
                        width: 1,
                        height: 1
                    })
                })
            }
            
            return element
        }),
        body: {
            appendChild: vi.fn()
        }
    },
    writable: true
})

Object.defineProperty(globalThis, 'navigator', {
    value: {
        userAgent: 'Mock Test Agent',
        storage: {
            estimate: vi.fn().mockResolvedValue({
                usage: 1024000,
                quota: 10240000
            })
        }
    },
    writable: true
})

Object.defineProperty(globalThis, 'window', {
    value: {
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 1,
        addEventListener: vi.fn(),
        requestAnimationFrame: vi.fn((cb) => setTimeout(cb, 16)),
        performance: {
            memory: {
                usedJSHeapSize: 1024000,
                totalJSHeapSize: 2048000
            }
        }
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
