import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { CameraInputApplier } from '../../../src/input/CameraInputApplier'
import { InputAction } from '../../../src/input/InputActions'
import type { InputActionResolver } from '../../../src/input/InputActionResolver'
import type { MovementOptions } from '../../../src/input/InputContracts'

function makeActionResolverStub(pressed: Partial<Record<string, boolean>>): InputActionResolver {
    return {
        getAxisValue: () => 0,
        isActionPressed: (actionId: string) => pressed[actionId] ?? false
    } as unknown as InputActionResolver
}

const options: MovementOptions = { speed: 0.075, mouseSensitivity: 0.005, sprintMultiplier: 1.5 }

describe('CameraInputApplier roll', () => {
    it('rolls the camera left when RollLeft is pressed', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.RollLeft]: true })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.z).toBeGreaterThan(0)
    })

    it('rolls the camera right when RollRight is pressed', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.RollRight]: true })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.z).toBeLessThan(0)
    })

    it('leaves roll unchanged when neither RollLeft nor RollRight is pressed', () => {
        const camera = new THREE.PerspectiveCamera()
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({})

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.z).toBe(0)
    })
})
