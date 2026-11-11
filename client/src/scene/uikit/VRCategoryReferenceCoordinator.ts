/**
 * Places a single VRCategoryReferencePanel as a standalone, world-positioned object - the actual
 * "world-lock" trial (direct correction, 2026-08-20): the earlier attempt world-locked the whole
 * VRSettingsPanelCoordinator menu instead, which wasn't what was asked for. This class is
 * deliberately separate from that coordinator: the category reference panel isn't a settings-menu
 * tab, has no open/close lifecycle tied to UIEventTypes.MenuOpen/MenuClose, and world-locks once at
 * first render rather than per-activation.
 *
 * Positioning math (yaw-only orientation stripped of camera pitch/roll, placed a fixed distance in
 * front of wherever the camera is the first time update() runs) duplicates
 * VRSettingsPanelCoordinator.attachWorldLocked() - a small, known, accepted duplication for this
 * trial rather than generalizing that coordinator into a shared "anchor any uikit panel" utility
 * up front; revisit if a third standalone-panel use case shows up (see
 * docs/plans/vr-uikit-menu-migration-plan.md's "unified menu definition" direction).
 *
 * Input goes through a UikitPointerBridge with controller rays off: it is mouse-only, because this
 * panel is always in the scene and a ray-drawing bridge here would stack a second beam on top of
 * the settings menu's and the game box's.
 */

import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { VRCategoryReferencePanel } from './panels/VRCategoryReferencePanel'
import { UikitPointerBridge } from './UikitPointerBridge'

// Matches VRSettingsPanelCoordinator's WORLD_LOCK_DISTANCE - not imported, that constant is
// module-private, and this panel's own size differs anyway so there's no real value tying them.
const WORLD_LOCK_DISTANCE = 1.2

export class VRCategoryReferenceCoordinator {
    private readonly panel = new VRCategoryReferencePanel()
    private readonly renderLoopRegistry = RenderLoopRegistry.getInstance()
    private readonly pointerBridge = new UikitPointerBridge(this.panel.container, undefined, { controllerRays: false })

    private placed = false

    init(): void {
        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
        const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (!scene || !camera) {
            return
        }

        if (!this.placed) {
            this.placeInWorld(this.panel.container, camera, scene)
            this.placed = true
        }

        // Retries until the renderer exists; a no-op once attached.
        this.pointerBridge.attach()
        this.pointerBridge.update()
        this.panel.container.update(deltaTime)
    }

    /** Same yaw-only-orientation math as VRSettingsPanelCoordinator.attachWorldLocked() - see that
     *  method's doc comment for why pitch/roll are stripped. */
    private placeInWorld(container: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
        camera.updateWorldMatrix(true, false)

        const cameraWorldPosition = new THREE.Vector3()
        camera.getWorldPosition(cameraWorldPosition)
        const cameraWorldQuaternion = new THREE.Quaternion()
        camera.getWorldQuaternion(cameraWorldQuaternion)

        const yaw = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ').y
        const yawQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'))
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuaternion)

        scene.add(container)
        container.position.copy(cameraWorldPosition).addScaledVector(forward, WORLD_LOCK_DISTANCE)
        container.quaternion.copy(yawQuaternion)
    }

    dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)
        this.pointerBridge.detach()
        this.panel.container.removeFromParent()
    }
}
