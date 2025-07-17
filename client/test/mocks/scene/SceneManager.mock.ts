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
    
    const mockCamera = {
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
        getRenderer: vi.fn().mockReturnValue(mockRenderer),
        createFloor: vi.fn(),
        createCeiling: vi.fn(),
        createFluorescentFixtures: vi.fn(),
        addToScene: vi.fn(),
        clearObjectsByUserData: vi.fn().mockReturnValue(0),
        startRenderLoop: vi.fn(),
        dispose: vi.fn()
    }
})

// Export async factory function for vi.mock() - enables one-line usage
export const sceneManagerMockFactory = async () => ({ SceneManager: SceneManagerMock })
