import * as THREE from 'three'
import { InputAction } from './InputActions'
import type { MovementOptions } from './InputContracts'
import { InputActionResolver } from './InputActionResolver'

export class CameraInputApplier {
    private static readonly ROLL_RADIANS_PER_FRAME = 0.02
    private static readonly MAX_PITCH_RADIANS = THREE.MathUtils.degToRad(89)

    updateMovement(
        camera: THREE.Camera,
        actionResolver: InputActionResolver,
        options: MovementOptions,
        sprintActive: boolean
    ): void {
        const sprintMultiplier = sprintActive ? options.sprintMultiplier : 1

        const forward = actionResolver.getAxisValue(InputAction.MoveForward)
        const back = actionResolver.getAxisValue(InputAction.MoveBack)
        const left = actionResolver.getAxisValue(InputAction.MoveLeft)
        const right = actionResolver.getAxisValue(InputAction.MoveRight)
        const up = actionResolver.getAxisValue(InputAction.MoveUp)
        const down = actionResolver.getAxisValue(InputAction.MoveDown)

        if (forward > 0) camera.translateZ(-(options.speed * forward * sprintMultiplier))
        if (back > 0) camera.translateZ(options.speed * back * sprintMultiplier)
        if (left > 0) camera.translateX(-(options.speed * left * sprintMultiplier))
        if (right > 0) camera.translateX(options.speed * right * sprintMultiplier)
        if (up > 0) camera.translateY(options.speed * up * sprintMultiplier)
        if (down > 0) camera.translateY(-(options.speed * down * sprintMultiplier))
    }

    updateRotation(camera: THREE.Camera, actionResolver: InputActionResolver, options: MovementOptions): void {
        if (actionResolver.isActionPressed(InputAction.ResetCamera)) {
            camera.rotation.set(0, 0, 0)
            return
        }

        const lookHorizontal = actionResolver.getAxisValue(InputAction.LookHorizontal)
        if (lookHorizontal !== 0) {
            camera.rotation.y -= lookHorizontal * options.mouseSensitivity
        }

        const lookVertical = actionResolver.getAxisValue(InputAction.LookVertical)
        if (lookVertical !== 0) {
            const nextPitch = camera.rotation.x - lookVertical * options.mouseSensitivity
            camera.rotation.x = THREE.MathUtils.clamp(nextPitch, -CameraInputApplier.MAX_PITCH_RADIANS, CameraInputApplier.MAX_PITCH_RADIANS)
        }

        if (actionResolver.isActionPressed(InputAction.RollLeft)) {
            camera.rotation.z += CameraInputApplier.ROLL_RADIANS_PER_FRAME
        }
        if (actionResolver.isActionPressed(InputAction.RollRight)) {
            camera.rotation.z -= CameraInputApplier.ROLL_RADIANS_PER_FRAME
        }
    }
}
