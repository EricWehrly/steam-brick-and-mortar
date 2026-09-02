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

import { XRControllerManager, type XRControllerSource } from '../../../src/webxr/XRControllerManager'

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

    it('publishes itself under DataKey.XRControllerSource in setup()', () => {
        manager.setup(renderer)

        const published = DataManager.getInstance().get<XRControllerSource>(DataKey.XRControllerSource)
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

    it('prunes stale duplicate controller models on update(), keeping only the most-recently-added child (guards against XRControllerModelFactory stacking a second GLTF when a runtime re-fires connected without disconnecting first)', () => {
        manager.setup(renderer)

        const controllerModel = grips[0].children[0]
        expect(controllerModel).toBeDefined()
        const staleModel = new THREE.Group()
        const freshModel = new THREE.Group()
        controllerModel.add(staleModel) // simulate two racing async profile loads both landing
        controllerModel.add(freshModel)
        expect(controllerModel.children.length).toBe(2)

        manager.update()

        expect(controllerModel.children).toEqual([freshModel])
    })

    it('disposes geometry/material of pruned stale children instead of just detaching them', () => {
        manager.setup(renderer)
        const controllerModel = grips[0].children[0]

        const staleGeometry = new THREE.BoxGeometry()
        const staleMaterial = new THREE.MeshBasicMaterial()
        const staleGroup = new THREE.Group()
        staleGroup.add(new THREE.Mesh(staleGeometry, staleMaterial))
        controllerModel.add(staleGroup)
        controllerModel.add(new THREE.Group()) // the one that should survive

        const geometryDispose = vi.spyOn(staleGeometry, 'dispose')
        const materialDispose = vi.spyOn(staleMaterial, 'dispose')

        manager.update()

        expect(geometryDispose).toHaveBeenCalledTimes(1)
        expect(materialDispose).toHaveBeenCalledTimes(1)
    })

    it('update() is a no-op when there is nothing to prune (single model, or none yet)', () => {
        manager.setup(renderer)
        const controllerModel = grips[0].children[0]

        expect(() => manager.update()).not.toThrow()
        expect(controllerModel.children.length).toBe(0)
    })

    it('getConnectedControllers() returns an empty list with no connected controllers', () => {
        manager.setup(renderer)
        expect(manager.getConnectedControllers()).toEqual([])
    })

    it('getConnectedControllers() returns every connected controller, not just the trigger-resolved primary one', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[0], 'left')
        dispatchConnected(controllers[1], 'right')

        const connected = manager.getConnectedControllers()

        expect(connected).toHaveLength(2)
        expect(connected).toEqual(expect.arrayContaining([
            { index: 0, handedness: 'left', targetRaySpace: controllers[0], triggerValue: 0 },
            { index: 1, handedness: 'right', targetRaySpace: controllers[1], triggerValue: 0 }
        ]))
    })

    it('getConnectedControllers() drops a controller once it disconnects', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[0], 'left')
        dispatchConnected(controllers[1], 'right')

        dispatchDisconnected(controllers[0])

        expect(manager.getConnectedControllers()).toEqual([
            { index: 1, handedness: 'right', targetRaySpace: controllers[1], triggerValue: 0 }
        ])
    })

    it('getConnectedControllers() reports live analog trigger depression per hand', () => {
        manager.setup(renderer)
        dispatchConnected(controllers[0], 'left')
        dispatchConnected(controllers[1], 'right')

        manager.setSession(createFakeSession([
            { handedness: 'left', gamepad: { buttons: [{ pressed: false, value: 0.35 }], axes: [] } as unknown as Gamepad },
            { handedness: 'right', gamepad: createFakeGamepad(false) }
        ]))

        const connected = manager.getConnectedControllers()

        expect(connected.find(entry => entry.handedness === 'left')?.triggerValue).toBeCloseTo(0.35)
        expect(connected.find(entry => entry.handedness === 'right')?.triggerValue).toBe(0)
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
