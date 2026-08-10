import * as THREE from 'three'
import { InputAction } from './InputActions'
import type { MovementOptions } from './InputContracts'
import { InputActionResolver } from './InputActionResolver'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'

export class CameraInputApplier {
    private static readonly ROLL_RADIANS_PER_FRAME = 0.02
    private static readonly MAX_PITCH_RADIANS = THREE.MathUtils.degToRad(89)
    private static readonly MIN_HORIZONTAL_DIRECTION_LENGTH_SQ = 1e-6

    // Cached once resolved - the real camera doesn't change after scene setup, same idiom
    // SceneClickGameBoxRaycast already uses for this exact kind of cross-class lookup.
    private resolvedCamera: THREE.Camera | null = null

    // Scratch fields, no per-frame allocation. lastForward/lastRight double as both the fallback
    // (when the camera briefly can't be resolved, or looks straight up/down - see
    // resolveHorizontalDirections) and the return value itself.
    private readonly tmpQuaternion = new THREE.Quaternion()
    private readonly tmpDirection = new THREE.Vector3()
    private readonly lastForward = new THREE.Vector3(0, 0, -1)
    private readonly lastRight = new THREE.Vector3(1, 0, 0)

    /**
     * `rig` is the camera's parent rig (see SceneManager's cameraRig doc comment), never the
     * camera itself - movement is applied to the rig's position. Movement DIRECTION, though, is
     * derived from the real camera's live view orientation, not the rig's own rotation: the rig's
     * rotation freezes during an active XR session (WebXRCoordinator skips rotation application
     * there entirely - the headset owns view rotation, per its own doc comment), so "forward" via
     * the rig's local axes would mean "wherever the rig faced when the session started," not
     * wherever the headset is actually looking. Outside XR the rig's rotation already tracks
     * mouse/gamepad look, so this produces the same yaw-relative direction as before - except
     * pitch (looking up/down) no longer tilts movement into the air/ground, since direction is
     * projected onto the horizontal plane first (see resolveHorizontalDirections).
     *
     * One-frame-stale during XR (this runs in the RenderLoopRegistry callback, before
     * renderer.render() each frame) - same accepted lag as SceneManager's cameraRig doc comment
     * already documents for getWorldPosition()/getWorldDirection() callers, imperceptible for
     * movement direction.
     */
    updateMovement(
        rig: THREE.Object3D,
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

        const { forward: forwardDir, right: rightDir } = this.resolveHorizontalDirections()

        if (forward > 0) rig.position.addScaledVector(forwardDir, options.speed * forward * sprintMultiplier)
        if (back > 0) rig.position.addScaledVector(forwardDir, -(options.speed * back * sprintMultiplier))
        if (right > 0) rig.position.addScaledVector(rightDir, options.speed * right * sprintMultiplier)
        if (left > 0) rig.position.addScaledVector(rightDir, -(options.speed * left * sprintMultiplier))
        // Vertical is plain world Y, not rig-local - correct regardless of rig roll (RollLeft/
        // RollRight tilt the rig's local Y axis; world Y never tilts).
        if (up > 0) rig.position.y += options.speed * up * sprintMultiplier
        if (down > 0) rig.position.y -= options.speed * down * sprintMultiplier
    }

    /**
     * The camera's current forward/right, projected onto the horizontal (XZ) plane and
     * renormalized - looking straight up/down must never tilt movement. Falls back to the
     * previous frame's direction (not a fixed default) when the camera can't be resolved yet, or
     * when the projected vector is degenerate (looking exactly straight up/down would otherwise
     * normalize a near-zero-length vector into NaN).
     */
    private resolveHorizontalDirections(): { forward: THREE.Vector3; right: THREE.Vector3 } {
        const camera = this.resolvedCamera ?? DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (!camera) {
            return { forward: this.lastForward, right: this.lastRight }
        }
        this.resolvedCamera = camera

        camera.getWorldQuaternion(this.tmpQuaternion)

        this.tmpDirection.set(0, 0, -1).applyQuaternion(this.tmpQuaternion)
        this.tmpDirection.y = 0
        if (this.tmpDirection.lengthSq() > CameraInputApplier.MIN_HORIZONTAL_DIRECTION_LENGTH_SQ) {
            this.lastForward.copy(this.tmpDirection).normalize()
        }

        this.tmpDirection.set(1, 0, 0).applyQuaternion(this.tmpQuaternion)
        this.tmpDirection.y = 0
        if (this.tmpDirection.lengthSq() > CameraInputApplier.MIN_HORIZONTAL_DIRECTION_LENGTH_SQ) {
            this.lastRight.copy(this.tmpDirection).normalize()
        }

        return { forward: this.lastForward, right: this.lastRight }
    }

    updateRotation(camera: THREE.Object3D, actionResolver: InputActionResolver, options: MovementOptions): void {
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
