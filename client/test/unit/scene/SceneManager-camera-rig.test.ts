import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Everything downstream of the camera-rig migration (RoomManager, WebXRCoordinator,
 * CameraInputApplier, getCameraWorldPosition() callers, etc.) assumes SceneManager actually
 * parents the camera under a rig that's itself in the scene - see SceneManager's own cameraRig
 * doc comment. Nothing in the suite asserted that foundational invariant directly before this
 * file; every other test either mocks a standalone rig or wires one manually into DataManager.
 *
 * Constructing a real SceneManager needs a real WebGL context, which isn't available in this
 * jsdom test environment - so the renderer/pipeline/PMREM construction is mocked out (this test
 * isn't about those), but the camera/cameraRig/scene themselves are real THREE.js objects,
 * exercising real Object3D parent/child semantics rather than reimplementing them.
 */

const mockRenderer = {
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
    autoClear: true,
    domElement: document.createElement('canvas'),
    xr: { enabled: false, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    dispose: vi.fn(),
    render: vi.fn(),
    setAnimationLoop: vi.fn(),
}

// mockImplementation must be a plain `function`, not an arrow function - arrow functions can't
// be used as constructors (`new (() => {})()` throws "is not a constructor"), and SceneManager
// constructs each of these with `new`.
vi.mock('../../../src/debug/ThreeWebGLRendererDebug', () => ({
    ThreeWebGLRendererDebug: vi.fn().mockImplementation(function () { return mockRenderer }),
}))

vi.mock('../../../src/debug/RenderPipelineManagerDebug', () => ({
    RenderPipelineManagerDebug: vi.fn().mockImplementation(function () {
        return {
            render: vi.fn(),
            setSize: vi.fn(),
            dispose: vi.fn(),
        }
    }),
}))

// Only PMREMGenerator is mocked - everything else THREE exports (Group, Scene,
// PerspectiveCamera, Vector3, color/tone-mapping constants, etc.) stays real.
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof import('three')>()
    return {
        ...actual,
        PMREMGenerator: vi.fn().mockImplementation(function () {
            return {
                fromScene: vi.fn().mockReturnValue({ texture: {} }),
                dispose: vi.fn(),
            }
        }),
    }
})

import { SceneManager } from '../../../src/scene/SceneManager'
import { CAMERA_SPAWN_YAW_RADIANS } from '../../../src/input/CameraInputApplier'

describe('SceneManager — camera rig construction invariant', () => {
    let sceneManager: SceneManager

    beforeEach(() => {
        sceneManager = new SceneManager()
    })

    it('parents the camera under the camera rig', () => {
        expect(sceneManager.getCameraRig().children).toContain(sceneManager.getCamera())
    })

    it('adds the camera rig to the scene', () => {
        expect(sceneManager.getScene().children).toContain(sceneManager.getCameraRig())
    })

    it('spawns facing CAMERA_SPAWN_YAW_RADIANS, not the rig\'s un-rotated default facing', () => {
        expect(sceneManager.getCameraRig().rotation.y).toBe(CAMERA_SPAWN_YAW_RADIANS)
    })

    it('sets rotation.order to YXZ so independently-driven yaw/pitch never interact (the fix for '
        + 'right-click-drag mouselook eventually flipping the view upside down)', () => {
        expect(sceneManager.getCameraRig().rotation.order).toBe('YXZ')
    })
})
