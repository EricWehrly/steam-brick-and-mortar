import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataKey } from '../../../src/core/data/DataTypes'

vi.mock('three/examples/jsm/webxr/XRControllerModelFactory.js', () => ({
    XRControllerModelFactory: vi.fn().mockImplementation(function () {
        // A fresh Group per call - THREE.Object3D.add() reparents (steals from any prior parent),
        // so a shared instance across both controller indices would silently move rather than
        // duplicate, masking exactly the kind of bug this factory is meant to stand in for.
        return { createControllerModel: vi.fn().mockImplementation(() => new THREE.Group()) }
    })
}))

import { XRControllerManager, type XRControllerRaySource } from '../../../src/webxr/XRControllerManager'

function createFakeRenderer(controllers: THREE.Group[], grips: THREE.Group[]): THREE.WebGLRenderer {
    return {
        xr: {
            getController: (i: number) => controllers[i],
            getControllerGrip: (i: number) => grips[i]
        }
    } as unknown as THREE.WebGLRenderer
}

// Plain THREE.Group's addEventListener/dispatchEvent types only know Object3DEventMap - real
// controller Groups (XRTargetRaySpace) are typed with WebXRSpaceEventMap's 'connected'/
// 'disconnected', which isn't available on the mocked plain Group used here.
type LooseDispatcher = { dispatchEvent: (event: { type: string; data?: unknown }) => void }

function dispatchConnected(controller: THREE.Group, handedness: XRHandedness, gamepad: Gamepad | null = null): void {
    (controller as unknown as LooseDispatcher).dispatchEvent({ type: 'connected', data: { handedness, gamepad } })
}

function dispatchDisconnected(controller: THREE.Group): void {
    (controller as unknown as LooseDispatcher).dispatchEvent({ type: 'disconnected' })
}

function createFakeGamepad(triggerPressed: boolean): Gamepad {
    return { buttons: [{ pressed: triggerPressed, value: triggerPressed ? 1 : 0 }], axes: [] } as unknown as Gamepad
}

function createFakeSession(inputSources: Array<{ handedness: XRHandedness; gamepad: Gamepad | null }>): XRSession {
    return { inputSources } as unknown as XRSession
}

describe('XRControllerManager', () => {
    let cameraRig: THREE.Object3D
    let controllers: THREE.Group[]
    let grips: THREE.Group[]
    let renderer: THREE.WebGLRenderer
    let manager: XRControllerManager

    beforeEach(() => {
        DataManager.resetInstance()
        cameraRig = new THREE.Object3D()
        controllers = [new THREE.Group(), new THREE.Group()]
        grips = [new THREE.Group(), new THREE.Group()]
        renderer = createFakeRenderer(controllers, grips)
        manager = new XRControllerManager({ cameraRig })
    })

    afterEach(() => {
        DataManager.resetInstance()
    })

    it('parents both controller and grip groups under the injected cameraRig, not the scene root', () => {
        const scene = new THREE.Scene()
        scene.add(cameraRig)

        manager.setup(renderer)

        expect(cameraRig.children).toContain(controllers[0])
        expect(cameraRig.children).toContain(grips[0])
        expect(cameraRig.children).toContain(controllers[1])
        expect(cameraRig.children).toContain(grips[1])
        expect(scene.children).not.toContain(controllers[0])
        expect(scene.children).not.toContain(grips[0])
    })

    it('publishes itself under DataKey.XRControllerRaySource in setup()', () => {
        manager.setup(renderer)

        const published = DataManager.getInstance().get<XRControllerRaySource>(DataKey.XRControllerRaySource)
        expect(published).toBe(manager)
    })

    it('returns null with no session', () => {
        manager.setup(renderer)
        expect(manager.getPrimaryControllerRay()).toBeNull()
    })

    it('returns null with a session but no connected controller', () => {
        manager.setup(renderer)
        manager.setSession(createFakeSession([]))
        expect(manager.getPrimaryControllerRay()).toBeNull()
    })

    it('resolves the ray from whichever hand currently has its trigger held', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[0], 'left')
        dispatchConnected(controllers[1], 'right')
        controllers[0].position.set(-1, 1, 0)
        controllers[1].position.set(1, 1, 0)

        manager.setSession(createFakeSession([
            { handedness: 'left', gamepad: createFakeGamepad(true) },
            { handedness: 'right', gamepad: createFakeGamepad(false) }
        ]))

        const ray = manager.getPrimaryControllerRay()
        expect(ray).not.toBeNull()
        expect(ray!.origin.x).toBeCloseTo(-1)
    })

    it('falls back to right, then left, when neither trigger is held', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[0], 'left')
        dispatchConnected(controllers[1], 'right')
        controllers[0].position.set(-1, 1, 0)
        controllers[1].position.set(1, 1, 0)

        manager.setSession(createFakeSession([
            { handedness: 'left', gamepad: createFakeGamepad(false) },
            { handedness: 'right', gamepad: createFakeGamepad(false) }
        ]))

        const ray = manager.getPrimaryControllerRay()
        expect(ray).not.toBeNull()
        expect(ray!.origin.x).toBeCloseTo(1) // right preferred over left when neither trigger held
    })

    it('forgets a hand mapping on disconnected', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[1], 'right')
        manager.setSession(createFakeSession([{ handedness: 'right', gamepad: createFakeGamepad(false) }]))
        expect(manager.getPrimaryControllerRay()).not.toBeNull()

        dispatchDisconnected(controllers[1])
        expect(manager.getPrimaryControllerRay()).toBeNull()
    })

    it('clears any previously loaded controller model on a repeat connected event (guards against XRControllerModelFactory stacking a second GLTF when a runtime re-fires connected without disconnecting first)', () => {
        manager.setup(renderer)

        const controllerModel = grips[0].children[0]
        expect(controllerModel).toBeDefined()
        controllerModel.add(new THREE.Group()) // simulate a model the factory already loaded
        expect(controllerModel.children.length).toBe(1)

        dispatchConnected(controllers[0], 'left') // repeat connect, no disconnect in between

        expect(controllerModel.children.length).toBe(0)
    })

    it('dispose() removes controller/grip groups from the camera rig', () => {
        manager.setup(renderer)
        expect(cameraRig.children.length).toBeGreaterThan(0)

        manager.dispose()

        expect(cameraRig.children).not.toContain(controllers[0])
        expect(cameraRig.children).not.toContain(grips[0])
        expect(cameraRig.children).not.toContain(controllers[1])
        expect(cameraRig.children).not.toContain(grips[1])
    })
})
