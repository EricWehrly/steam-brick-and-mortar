import * as THREE from 'three'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CameraInputApplier } from '../../../src/input/CameraInputApplier'
import { InputAction } from '../../../src/input/InputActions'
import type { InputActionResolver } from '../../../src/input/InputActionResolver'
import type { MovementOptions } from '../../../src/input/InputContracts'
import { DataManager } from '../../../src/core/data/DataManager'
import { DataDomain, DataKey } from '../../../src/core/data/DataTypes'

function makeActionResolverStub(axes: Partial<Record<string, number>>): InputActionResolver {
    return {
        getAxisValue: (actionId: string) => axes[actionId] ?? 0,
        isActionPressed: () => false
    } as unknown as InputActionResolver
}

const options: MovementOptions = { speed: 0.075, mouseSensitivity: 0.005, sprintMultiplier: 1.5 }

describe('CameraInputApplier movement - camera-relative, horizontal-projected', () => {
    beforeEach(() => {
        DataManager.resetInstance()
    })

    afterEach(() => {
        DataManager.resetInstance()
    })

    // The core VR-fix regression: the rig's own rotation freezes during an XR session (see
    // WebXRCoordinator), so movement must follow the real CAMERA's world orientation, not the
    // rig's. Simulated here by giving the camera a distinct local rotation from its rig parent
    // (exactly how three.js composes a headset's tracked pose as a child offset) and asserting
    // movement follows the camera's direction, not the rig's own (unrotated) local -Z.
    it('moves in the camera world direction, not the rig own local axes', () => {
        const rig = new THREE.Object3D()
        const camera = new THREE.PerspectiveCamera()
        rig.add(camera)
        camera.rotation.y = Math.PI / 2 // headset turned 90° right relative to the frozen rig
        rig.updateMatrixWorld(true)

        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        const applier = new CameraInputApplier()
        applier.updateMovement(rig, makeActionResolverStub({ [InputAction.MoveForward]: 1 }), options, false)

        // Camera forward (0,0,-1) rotated +90° around Y -> (-1,0,0): expect movement along -X,
        // NOT along -Z (which is what the rig's own unrotated local -Z would have produced).
        expect(rig.position.x).toBeCloseTo(-options.speed)
        expect(rig.position.z).toBeCloseTo(0)
    })

    it('does not tilt movement when the camera is pitched up or down', () => {
        const rig = new THREE.Object3D()
        const camera = new THREE.PerspectiveCamera()
        rig.add(camera)
        camera.rotation.x = THREE.MathUtils.degToRad(-60) // looking steeply up
        rig.updateMatrixWorld(true)

        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        const applier = new CameraInputApplier()
        applier.updateMovement(rig, makeActionResolverStub({ [InputAction.MoveForward]: 1 }), options, false)

        expect(rig.position.y).toBeCloseTo(0) // no vertical creep from pitch
        expect(rig.position.length()).toBeCloseTo(options.speed) // full horizontal speed regardless of pitch
    })

    it('applies vertical movement as world Y regardless of rig roll', () => {
        const rig = new THREE.Object3D()
        rig.rotation.z = THREE.MathUtils.degToRad(30) // rolled - would leak into x/z if vertical used local translateY
        rig.updateMatrixWorld(true)

        const applier = new CameraInputApplier()
        applier.updateMovement(rig, makeActionResolverStub({ [InputAction.MoveUp]: 1 }), options, false)

        expect(rig.position.y).toBeCloseTo(options.speed)
        expect(rig.position.x).toBeCloseTo(0)
        expect(rig.position.z).toBeCloseTo(0)
    })

    it('falls back to a stable default direction (does not throw/NaN) when no camera is published yet', () => {
        const rig = new THREE.Object3D()

        const applier = new CameraInputApplier()
        expect(() => applier.updateMovement(rig, makeActionResolverStub({ [InputAction.MoveForward]: 1 }), options, false)).not.toThrow()

        expect(Number.isFinite(rig.position.x)).toBe(true)
        expect(Number.isFinite(rig.position.y)).toBe(true)
        expect(Number.isFinite(rig.position.z)).toBe(true)
    })

    it('applies sprint multiplier to camera-relative movement', () => {
        const rig = new THREE.Object3D()
        const camera = new THREE.PerspectiveCamera()
        rig.add(camera)
        rig.updateMatrixWorld(true)

        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        const applier = new CameraInputApplier()
        applier.updateMovement(rig, makeActionResolverStub({ [InputAction.MoveForward]: 1 }), options, true)

        expect(rig.position.z).toBeCloseTo(-options.speed * options.sprintMultiplier)
    })
})
