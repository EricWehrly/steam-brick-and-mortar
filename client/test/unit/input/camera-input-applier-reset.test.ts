import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { CameraInputApplier } from '../../../src/input/CameraInputApplier'
import { InputAction } from '../../../src/input/InputActions'
import type { InputActionResolver } from '../../../src/input/InputActionResolver'
import type { MovementOptions } from '../../../src/input/InputContracts'

function makeActionResolverStub(
    pressed: Partial<Record<string, boolean>>,
    axisValues: Partial<Record<string, number>> = {}
): InputActionResolver {
    return {
        getAxisValue: (actionId: string) => axisValues[actionId] ?? 0,
        isActionPressed: (actionId: string) => pressed[actionId] ?? false
    } as unknown as InputActionResolver
}

const options: MovementOptions = { speed: 0.075, mouseSensitivity: 0.005, sprintMultiplier: 1.5 }

describe('CameraInputApplier reset', () => {
    it('snaps rotation back to identity when ResetCamera is pressed, leaving position untouched', () => {
        const camera = new THREE.PerspectiveCamera()
        camera.position.set(12, 4, -30)
        camera.rotation.set(0.4, 1.2, 0.3)
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({ [InputAction.ResetCamera]: true })

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBe(0)
        expect(camera.rotation.y).toBe(0)
        expect(camera.rotation.z).toBe(0)
        expect(camera.position.x).toBe(12)
        expect(camera.position.y).toBe(4)
        expect(camera.position.z).toBe(-30)
    })

    it('leaves rotation untouched when ResetCamera is not pressed', () => {
        const camera = new THREE.PerspectiveCamera()
        camera.rotation.set(0.4, 1.2, 0.3)
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub({})

        applier.updateRotation(camera, resolver, options)

        expect(camera.rotation.x).toBe(0.4)
        expect(camera.rotation.y).toBe(1.2)
        expect(camera.rotation.z).toBe(0.3)
    })

    it('does not affect movement, even if ResetCamera is also held', () => {
        const camera = new THREE.PerspectiveCamera()
        camera.position.set(12, 4, -30)
        const applier = new CameraInputApplier()
        const resolver = makeActionResolverStub(
            { [InputAction.ResetCamera]: true },
            { [InputAction.MoveForward]: 1 }
        )

        applier.updateMovement(camera, resolver, options, false)

        expect(camera.position.z).toBeLessThan(-30)
    })
})
