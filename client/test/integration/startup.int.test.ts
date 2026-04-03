/**
 * Integration test to ensure the application starts up without errors
 * This test specifically covers the startup sequence that was failing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UIManager } from '../../src/ui/UIManager'
import { SteamUICoordinator } from '../../src/ui/coordinators/SteamUICoordinator'
import { EventManager } from '../../src/core/EventManager'
import { SteamEventTypes } from '../../src/types/InteractionEvents'
import { createMockWebGLContext } from '../utils/webgl-test-mocks'

const mockCapabilities = {
    hasWebGL2: true,
    hasInstancedArrays: true,
    hasHardwareRenderer: true,
    supportsLargeTextures: true,
    hasGoodGPU: true,
    maxTextureSize: 4096,
    renderer: 'Mock GPU Renderer'
}

vi.mock('../../src/utils/SystemCapabilities', () => ({
    hasWebGL2: () => true,
    hasInstancedArrays: () => true,
    hasHardwareRenderer: () => true,
    supportsLargeTextures: () => true,
    hasGoodGPU: () => true,
    detectSystemCapabilities: () => mockCapabilities,
    SystemCapabilitiesDetector: {
        detect: () => mockCapabilities,
        redetect: () => mockCapabilities,
        meetsRequirements: (requirements: Record<string, unknown>) =>
            Object.entries(requirements).every(([key, value]) => mockCapabilities[key as keyof typeof mockCapabilities] === value)
    }
}))

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
    WebGLRenderer: vi.fn().mockImplementation(function() { return {
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
        getContext: vi.fn().mockReturnValue(createMockWebGLContext()),
        debug: {
            checkShaderErrors: false
        }
    } }),
    Scene: vi.fn().mockImplementation(function() { return {
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        traverse: vi.fn(),
        getObjectByName: vi.fn(),
        userData: {},
        background: null
    } }),
    PerspectiveCamera: vi.fn().mockImplementation(function() { return {
        position: { set: vi.fn() },
        lookAt: vi.fn(),
        aspect: 1,
        updateProjectionMatrix: vi.fn()
    } }),
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
    Mesh: vi.fn().mockImplementation(function() { return {
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        rotation: { x: 0, y: 0, z: 0, set: vi.fn() },
        scale: { x: 1, y: 1, z: 1, set: vi.fn() },
        material: null,
        geometry: null,
        userData: {}
    } }),
    Group: vi.fn().mockImplementation(function() { return {
        add: vi.fn(),
        remove: vi.fn(),
        children: [],
        position: { x: 0, y: 0, z: 0, set: vi.fn() },
        rotation: { x: 0, y: 0, z: 0, set: vi.fn() },
        scale: { x: 1, y: 1, z: 1, set: vi.fn() },
        userData: {}
    } }),
    Material: vi.fn(),
    MeshStandardMaterial: vi.fn(),
    BoxGeometry: vi.fn(),
    PlaneGeometry: vi.fn(),
    Vector3: vi.fn(),
    Euler: vi.fn(),
    Light: vi.fn().mockImplementation(function() { return {
        position: { set: vi.fn() },
        castShadow: false
    } }),
    DirectionalLight: vi.fn().mockImplementation(function() { return {
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
    } }),
    AmbientLight: vi.fn().mockImplementation(function() { return {
        intensity: 1
    } }),
    Camera: vi.fn(),
    Object3D: vi.fn(),
    TextureLoader: vi.fn().mockImplementation(function() { return {
        load: vi.fn(),
        setPath: vi.fn(),
        setCrossOrigin: vi.fn()
    } }),
    Texture: vi.fn()
    }
})

vi.mock('../../src/ui/PerformanceMonitor', () => ({
    PerformanceMonitor: vi.fn().mockImplementation(function() { return {
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
    } })
}))

vi.mock('../../src/webxr/WebXRManager', () => ({
    WebXRManager: vi.fn().mockImplementation(function() { return {
        init: vi.fn(),
        dispose: vi.fn(),
        checkWebXRSupport: vi.fn().mockResolvedValue({ supportsImmersiveVR: false }),
        getCapabilities: vi.fn().mockReturnValue({ supportsImmersiveVR: false }),
        isSessionActive: vi.fn().mockReturnValue(false)
    } })
}))

vi.mock('../../src/scene/SceneManager', () => ({
    SceneManager: vi.fn().mockImplementation(function() { return {
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
    } })
}))

vi.mock('../../src/scene/StoreLayout', () => ({
    StoreLayout: vi.fn().mockImplementation(function() { return {
        createDefaultLayout: vi.fn().mockReturnValue({}),
        dispose: vi.fn()
    } })
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
                    ...createMockWebGLContext(),
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

    it('should create SteamIntegration and SteamUICoordinator without binding errors', async () => {
        // Import classes for testing
        const { SteamIntegration } = await import('../../src/steam-integration/SteamIntegration')
        const { SteamUICoordinator } = await import('../../src/ui/coordinators')

        // Test SteamIntegration and SteamUICoordinator can be created without binding errors
        // (SteamWorkflowManager functionality now split between these classes)
        expect(() => {
            const steamIntegration = new SteamIntegration()
            const steamUICoordinator = new SteamUICoordinator()
        }).not.toThrow()
    })

    it('should properly wire SteamUICoordinator with UIManager during startup', () => {
        // Setup minimal DOM elements that the UI components require
        const requiredElements = [
            'steam-ui', 'steam-user-input', 'load-steam-games', 'load-from-cache',
            'refresh-cache', 'clear-cache', 'show-cache-stats', 'cache-info', 'steam-status'
        ]
        
        const createdElements: HTMLElement[] = []
        
        // Create all required elements
        requiredElements.forEach(id => {
            const element = document.createElement(id === 'steam-user-input' ? 'input' : 'div')
            element.id = id
            document.body.appendChild(element)
            createdElements.push(element)
        })
        
        const steamStatus = document.getElementById('steam-status')!
        const eventManager = EventManager.getInstance()
        const emitSpy = vi.spyOn(eventManager, 'emit')

        expect(() => {
            // Create instances like the real application does
            const uiManager = UIManager.getInstance()
            const coordinator = new SteamUICoordinator()
            
            // Initialize like startup would - this creates the internal UI components
            uiManager.init()
            
            // Now test the coordinator -> uiManager -> DOM pipeline
            coordinator.loadFromCache('test-user-id')
        }).not.toThrow()
        
        // Verify the coordinator emits the expected action event
        expect(steamStatus).toBeTruthy()
        expect(emitSpy).toHaveBeenCalledWith(SteamEventTypes.LoadFromCache, expect.objectContaining({
            userInput: 'test-user-id'
        }))
        emitSpy.mockRestore()
        
        // Cleanup all created elements
        createdElements.forEach(element => {
            element.remove()
        })
    })
})
