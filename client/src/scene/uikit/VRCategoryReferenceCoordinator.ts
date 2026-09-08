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
 * Only flatscreen mouse interaction is wired (forwardHtmlEvents) - VR controller-ray interaction
 * (VRControllerPointer) is deliberately not, since this panel has no clickable controls yet, only
 * scroll, and this is a first look at how world-locked content reads at all.
 */

import * as THREE from 'three'
import { forwardHtmlEvents } from '@pmndrs/pointer-events'
import type { ForwardEventsOptions } from '@pmndrs/pointer-events'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { VRCategoryReferencePanel } from './panels/VRCategoryReferencePanel'

// Matches VRSettingsPanelCoordinator's WORLD_LOCK_DISTANCE - not imported, that constant is
// module-private, and this panel's own size differs anyway so there's no real value tying them.
const WORLD_LOCK_DISTANCE = 1.2

type ForwardEventsFn = (
    fromElement: HTMLElement,
    getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera,
    scene: THREE.Object3D,
    options?: ForwardEventsOptions
) => { destroy: () => void; update: () => void }

export class VRCategoryReferenceCoordinator {
    private readonly panel = new VRCategoryReferencePanel()
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly forwardEvents: ForwardEventsFn

    private renderer: THREE.WebGLRenderer | null = null
    private forwardedEvents: { update: () => void; destroy: () => void } | null = null
    private placed = false

    constructor(forwardEvents: ForwardEventsFn = forwardHtmlEvents) {
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.forwardEvents = forwardEvents
    }

    init(renderer: THREE.WebGLRenderer): void {
        this.renderer = renderer
        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
        const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        if (!scene || !camera || !this.renderer) {
            return
        }

        if (!this.placed) {
            this.placeInWorld(this.panel.container, camera, scene)
            this.placed = true
            this.forwardedEvents = this.forwardEvents(this.renderer.domElement, () => camera as THREE.PerspectiveCamera, scene)
        }

        this.forwardedEvents?.update()
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
        this.forwardedEvents?.destroy()
        this.forwardedEvents = null
        this.panel.container.removeFromParent()
        this.renderer = null
    }
}
