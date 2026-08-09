/**
 * Mock for SceneManager
 */
import { vi } from 'vitest'

export const SceneManagerMock = vi.fn().mockImplementation(() => {
    // Create simple mock objects without relying on THREE.js constructors
    const mockScene = {
        add: vi.fn(),
        remove: vi.fn(),
        dispose: vi.fn()
    }
    
    // The camera is parented under the rig in production (see SceneManager's cameraRig doc
    // comment) - camera.position is always a local offset (identity here, matching reality),
    // never world position. World placement lives on the rig. Keeping these distinct (instead of
    // both reporting the same coordinates) means a test that wrongly reads getCamera().position
    // expecting world coordinates gets an implausible (0,0,0) instead of a plausible-looking wrong
    // answer from the rig's own position.
    const mockCamera = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        lookAt: vi.fn(),
        getWorldPosition: vi.fn((target = { x: 0, y: 5, z: 10 }) => Object.assign(target, { x: 0, y: 5, z: 10 }))
    }

    const mockCameraRig = {
        position: { x: 0, y: 5, z: 10 },
        rotation: { x: 0, y: 0, z: 0 },
        lookAt: vi.fn()
    }

    const mockRenderer = {
        setSize: vi.fn(),
        setPixelRatio: vi.fn(),
        shadowMap: { enabled: false, type: 0 },
        outputColorSpace: '',
        domElement: document.createElement('canvas'),
        dispose: vi.fn(),
        render: vi.fn()
    }
    
    return {
        getScene: vi.fn().mockReturnValue(mockScene),
        getCamera: vi.fn().mockReturnValue(mockCamera),
        getCameraRig: vi.fn().mockReturnValue(mockCameraRig),
        getRenderer: vi.fn().mockReturnValue(mockRenderer),
        startRenderLoop: vi.fn(),
        stopRenderLoop: vi.fn(),
        dispose: vi.fn()
    }
})

// Export async factory function for vi.mock() - enables one-line usage
export const sceneManagerMockFactory = async () => ({ SceneManager: SceneManagerMock })
