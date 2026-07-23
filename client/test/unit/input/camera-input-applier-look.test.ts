import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { CameraInputApplier } from '../../../src/input/CameraInputApplier'
import { InputAction } from '../../../src/input/InputActions'
import type { InputActionResolver } from '../../../src/input/InputActionResolver'
import type { MovementOptions } from '../../../src/input/InputContracts'

function makeActionResolverStub(axisValues: Partial<Record<string, number>>): InputActionResolver {
    return {
        getAxisValue: (actionId: string) => axisValues[actionId] ?? 0,
        isActionPressed: () => false
    } as unknown as InputActionResolver
}

const options: MovementOptions = { speed: 0.075, mouseSensitivity: 0.005, sprintMultiplier: 1.5 }

describe('CameraInputApplier look', () => {
    it('applies LookHorizontal to yaw', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.LookHorizontal]: 10 })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.y).toBeLessThan(0)
    })

    it('applies LookVertical to pitch, moving the mouse up looks up', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        // Negative LookVertical mirrors a negative raw mouse deltaY (mouse moved up).
        const resolver = makeActionResolverStub({ [InputAction.LookVertical]: -10 })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBeGreaterThan(0)
    })

    it('clamps pitch so the camera cannot flip past vertical', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.LookVertical]: -100000 })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBeLessThanOrEqual(THREE.MathUtils.degToRad(89))
    })

    it('clamps pitch on the negative side too', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.LookVertical]: 100000 })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBeGreaterThanOrEqual(-THREE.MathUtils.degToRad(89))
    })

    it('leaves rotation untouched when no look axis is active', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({})

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBe(0)
        expect(camera.rotation.y).toBe(0)
    })
})
