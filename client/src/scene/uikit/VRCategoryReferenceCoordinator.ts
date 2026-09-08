/**
 * The category-reference tool now has exactly one implementation - direct request (2026-09-05):
 * "we don't need a 'VR' variant. We're just gonna have the one." Replaces the DOM
 * CategoryReferencePanel entirely (toggle button + 'G' hotkey + HTML table), rather than keeping
 * both around. Places a single VRCategoryReferencePanel as a standalone, world-positioned object -
 * not a settings-menu tab, no MenuOpen/MenuClose lifecycle - toggled by the same 'G' key the DOM
 * version used, world-locking once at first open rather than at construction time.
 *
 * Interactive on both surfaces via UikitPointerBridge (forwardHtmlEvents for flatscreen mouse,
 * one VRControllerPointer per connected WebXR controller for VR) - the same generic bridge
 * VRSettingsPanelCoordinator's own interaction is built on, so this isn't a second hand-rolled
 * interactivity mechanism.
 *
 * Positioning math (yaw-only orientation stripped of camera pitch/roll, placed a fixed distance in
 * front of wherever the camera is at first open) duplicates
 * VRSettingsPanelCoordinator.attachWorldLocked() - a small, known, accepted duplication for this
 * trial rather than generalizing that coordinator into a shared "anchor any uikit panel" utility
 * up front; revisit if a third standalone-panel use case shows up (see
 * docs/plans/vr-uikit-menu-migration-plan.md's "unified menu definition" direction).
 */

import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { UikitPointerBridge } from './UikitPointerBridge'
import { VRCategoryReferencePanel } from './panels/VRCategoryReferencePanel'

// Matches VRSettingsPanelCoordinator's WORLD_LOCK_DISTANCE - not imported, that constant is
// module-private, and this panel's own size differs anyway so there's no real value tying them.
const WORLD_LOCK_DISTANCE = 1.2
const TOGGLE_KEY = 'g'

export class VRCategoryReferenceCoordinator {
    private readonly panel = new VRCategoryReferencePanel()
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly pointerBridge: UikitPointerBridge
    private readonly keydownHandler: (event: KeyboardEvent) => void

    private isOpen = false
    private placed = false

    constructor() {
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.pointerBridge = new UikitPointerBridge(this.panel.container)
        this.panel.container.visible = false

        this.keydownHandler = (event: KeyboardEvent) => {
            if (
                event.key.toLowerCase() === TOGGLE_KEY &&
                !event.ctrlKey && !event.metaKey &&
                !(document.activeElement instanceof HTMLInputElement) &&
                !(document.activeElement instanceof HTMLTextAreaElement)
            ) {
                this.toggle()
            }
        }
    }

    init(): void {
        document.addEventListener('keydown', this.keydownHandler)
        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    toggle(): void {
        this.isOpen = !this.isOpen
        this.panel.container.visible = this.isOpen

        if (this.isOpen) {
            this.pointerBridge.attach()
        } else {
            this.pointerBridge.detach()
        }
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        if (!this.isOpen) {
            return
        }

        if (!this.placed) {
            const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
            const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
            if (!scene || !camera) {
                return
            }
            this.placeInWorld(this.panel.container, camera, scene)
            this.placed = true
        }

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
        document.removeEventListener('keydown', this.keydownHandler)
        this.renderLoopRegistry.unregister(this.constructor.name)
        this.pointerBridge.detach()
        this.panel.container.removeFromParent()
    }
}
