/**
 * VR Settings Panel Coordinator - owns a real @pmndrs/uikit component tree in the 3D scene,
 * instead of projecting the DOM pause menu (that approach - a CSS3D-projected copy of the DOM
 * menu - was tried and removed; it never reaches an actual immersive WebXR session, confirmed in
 * docs/plans/css3d-panel-projection-spike.md). This is real WebGL geometry, so it renders
 * correctly inside a headset.
 *
 * Owns a single long-lived VRSettingsMenuShell (Story 4 of docs/plans/vr-uikit-menu-migration-plan.md)
 * - the tab column + content-swap area - constructed once here rather than per-activation, so its
 * UIEventTypes.MenuPanelChanged subscription is never missed (see the shell's own doc comment for
 * why). Only the shell's container is attached/detached from the anchor per open/close; this
 * coordinator's job is purely anchoring + pointer lifecycle, not panel content. Interaction is
 * wired two ways: @pmndrs/pointer-events' forwardHtmlEvents
 * drives hover/click/scroll from real DOM mouse/wheel events on the renderer canvas (flatscreen
 * testing, mouse acts as a cursor); syncControllerPointers()/VRControllerPointer drive the same
 * pointer-events pipeline from real WebXR controllers - one ray-pointer per connected controller,
 * self-healing every frame the same way XRControllerManager self-heals its own controller-model
 * pruning. Trigger down/up for these is native WebXR 'selectstart'/'selectend', independent of the
 * app's own gamepad-button input abstraction - see VRControllerPointer's doc comment. A VR trigger
 * pull also still fires the app's own gamepad-button-driven InteractPressed in parallel, but
 * SystemUICoordinator.handleInteractPressed no-ops while any menu is open, so it can't reach
 * through this panel to select a game box behind it.
 *
 * Shows/hides on the same UIEventTypes.MenuOpen/MenuClose events the DOM pause menu already
 * drives (see SystemUICoordinator's handlePauseMenuOpened/Closed) - VR's "Menu Button" already
 * flows into these via PauseMenuManager, so no new input wiring was needed. The DOM pause menu is
 * deliberately NOT suppressed while this panel is active; both can be open at once for now, an
 * accepted simplification while this panel stays behind the ?forceVRSettingsPanel=1 dev flag.
 * That flag only pre-activates at init() for flatscreen-preview convenience - a real MenuClose
 * always deactivates regardless of the flag, so once you've opened/closed it once for real, the
 * force flag stops being observable and this panel just tracks the DOM menu's state honestly.
 *
 * Anchor strategy (settled 2026-08-19 via live headset testing, see
 * docs/plans/vr-uikit-menu-migration-plan.md) is switchable via VRPanelAnchorMode:
 * 'camera-attached' (default - moves with the player's head, like a HUD) won out over
 * 'world-lock' (pinned to a fixed point in front of the player at open time) and 'grip-attached'
 * (follows the primary controller - swings while you point at it with the same hand). The losing
 * modes are kept, not deleted, in case a future panel shape wants a different anchor.
 */

import * as THREE from 'three'
import { reversePainterSortStable } from '@pmndrs/uikit'
import { forwardHtmlEvents } from '@pmndrs/pointer-events'
import type { ForwardEventsOptions } from '@pmndrs/pointer-events'
import { EventManager } from '../../core/EventManager'
import { AppSettings } from '../../core/AppSettings'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { UIEventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../types/InteractionEvents'
import { UrlUtils } from '../../utils/UrlUtils'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import type { XRControllerRaySource, XRControllerRayInfo } from '../../webxr/XRControllerManager'
import { VRSettingsMenuShell } from './VRSettingsMenuShell'
import { VRControllerPointer } from './VRControllerPointer'

// Same "held in front of the viewer" convention GameBoxFoldCoordinator uses - kept in parity,
// not imported (that constant is module-private).
const CAMERA_LOCAL_OFFSET = new THREE.Vector3(0, 0, -0.6)
const GRIP_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.3)
// Distance in front of the player the panel world-locks to at open time - matches
// CAMERA_LOCAL_OFFSET's magnitude so the two modes place the panel at the same initial distance.
const WORLD_LOCK_DISTANCE = 0.6

/** Which fixed point the VR settings panel is anchored to while open. 'camera-attached' (default,
 *  settled 2026-08-19) parents it to the camera so it moves with the player's head like a HUD -
 *  the winner of a live headset A/B against the other two modes, kept below for a future panel
 *  that might want a different anchor. 'world-lock' pins it to a point in front of the player
 *  computed once at open time, so it stays still in the world while they look/move around it.
 *  'grip-attached' follows the primary controller. See the constructor's anchorMode parameter to
 *  switch. */
export type VRPanelAnchorMode = 'camera-attached' | 'world-lock' | 'grip-attached'
const DEFAULT_ANCHOR_MODE: VRPanelAnchorMode = 'camera-attached'

/** Matches forwardHtmlEvents' own signature - injectable so tests can avoid it entirely: jsdom's
 *  canvas doesn't implement Pointer Events capture APIs (setPointerCapture/...), which
 *  forwardHtmlEvents depends on, so a real call throws under jsdom regardless of how faithfully
 *  the renderer/canvas stand-in is built. */
type ForwardEventsFn = (
    fromElement: HTMLElement,
    getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera,
    scene: THREE.Object3D,
    options?: ForwardEventsOptions
) => { destroy: () => void; update: () => void }

export class VRSettingsPanelCoordinator {
    private readonly eventManager: EventManager
    private readonly appSettings: AppSettings
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly forceEnabled: boolean
    private readonly forwardEvents: ForwardEventsFn
    private readonly anchorMode: VRPanelAnchorMode

    private readonly menuShell: VRSettingsMenuShell

    private renderer: THREE.WebGLRenderer | null = null
    private forwardedEvents: { update: () => void; destroy: () => void } | null = null
    private readonly controllerPointers = new Map<number, VRControllerPointer>()
    private active = false

    private resolvedScene: THREE.Scene | null = null
    private resolvedCamera: THREE.Camera | null = null

    constructor(
        eventManager: EventManager,
        appSettings: AppSettings,
        forceEnabled: boolean = UrlUtils.isVRSettingsPanelForced(),
        forwardEvents: ForwardEventsFn = forwardHtmlEvents,
        anchorMode: VRPanelAnchorMode = DEFAULT_ANCHOR_MODE
    ) {
        this.eventManager = eventManager
        this.appSettings = appSettings
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.forceEnabled = forceEnabled
        this.forwardEvents = forwardEvents
        this.anchorMode = anchorMode
        this.menuShell = new VRSettingsMenuShell(eventManager, appSettings)

        this.eventManager.registerEventHandler<MenuOpenEvent>(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.registerEventHandler<MenuCloseEvent>(UIEventTypes.MenuClose, this.handleMenuClose)
    }

    init(renderer: THREE.WebGLRenderer): void {
        this.renderer = renderer

        // Both required by uikit for correct panel transparency/ordering - see the vanilla usage
        // example in @pmndrs/uikit's own README. Global renderer flags, safe to set unconditionally.
        renderer.localClippingEnabled = true
        renderer.setTransparentSort(reversePainterSortStable)

        this.renderLoopRegistry.register(this.constructor.name, this.update)

        if (this.forceEnabled) {
            this.activate()
        }
    }

    private readonly handleMenuOpen = (event: CustomEvent<MenuOpenEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            return
        }
        this.activate()
    }

    private readonly handleMenuClose = (event: CustomEvent<MenuCloseEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            return
        }
        // A real close always deactivates, force flag or not - see the class doc comment. The
        // flag used to suppress this (to keep the panel visible for flatscreen preview
        // regardless of menu state), but that made the panel look unresponsive to the real
        // Settings/OpenMenu toggle once someone actually pressed it during a force-flagged
        // session - confirmed live 2026-08-19.
        this.deactivate()
    }

    private getScene(): THREE.Scene | null {
        this.resolvedScene ??= DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene) ?? null
        return this.resolvedScene
    }

    private getCamera(): THREE.Camera | null {
        this.resolvedCamera ??= DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera) ?? null
        return this.resolvedCamera
    }

    private activate(): void {
        if (this.active) {
            return
        }

        const scene = this.getScene()
        const camera = this.getCamera()
        if (!scene || !camera || !this.renderer) {
            console.warn('VRSettingsPanelCoordinator: scene/camera/renderer not ready yet, skipping activation')
            return
        }

        this.attachToAnchor(this.menuShell.container, camera, scene)

        this.forwardedEvents = this.forwardEvents(this.renderer.domElement, () => camera as THREE.PerspectiveCamera, scene)

        this.active = true
    }

    private deactivate(): void {
        if (!this.active) {
            return
        }

        this.forwardedEvents?.destroy()
        this.forwardedEvents = null

        for (const pointer of this.controllerPointers.values()) {
            pointer.dispose()
        }
        this.controllerPointers.clear()

        this.menuShell.container.removeFromParent()

        this.active = false
    }

    /**
     * Self-healing, mirroring XRControllerManager.update()'s own per-frame controller-model
     * pruning: recomputes the connected-controller list every frame and reconciles
     * this.controllerPointers to match, rather than trying to time creation/disposal around
     * 'connected'/'disconnected' events. Correct regardless of controllers connecting or
     * disconnecting mid-session while the panel is open.
     */
    private syncControllerPointers(scene: THREE.Scene, camera: THREE.Camera): ReadonlyArray<XRControllerRayInfo> {
        const raySource = DataManager.getInstance().get<XRControllerRaySource>(DataKey.XRControllerRaySource) ?? null
        const connected = raySource?.getControllerRaySpaces?.() ?? []
        const connectedIndices = new Set(connected.map(entry => entry.index))

        for (const [index, pointer] of this.controllerPointers) {
            if (!connectedIndices.has(index)) {
                pointer.dispose()
                this.controllerPointers.delete(index)
            }
        }

        for (const { index, raySpace } of connected) {
            if (this.controllerPointers.has(index)) {
                continue
            }
            this.controllerPointers.set(index, new VRControllerPointer({
                raySpace,
                getCamera: () => camera as THREE.PerspectiveCamera,
                intersectRoot: this.menuShell.container,
                scene
            }))
        }

        return connected
    }

    private attachToAnchor(container: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
        // Logged every activation, on purpose - this is a live A/B still being evaluated in
        // headset (see the class doc comment and docs/plans/vr-uikit-menu-migration-plan.md's
        // anchoring decision), not settled behavior. Flip DEFAULT_ANCHOR_MODE (or pass an
        // explicit anchorMode to the constructor) to compare the two.
        console.log(`VRSettingsPanelCoordinator: anchoring panel via '${this.anchorMode}'.`)

        if (this.anchorMode === 'camera-attached') {
            camera.add(container)
            container.position.copy(CAMERA_LOCAL_OFFSET)
            return
        }

        if (this.anchorMode === 'grip-attached') {
            const raySource = DataManager.getInstance().get<XRControllerRaySource>(DataKey.XRControllerRaySource) ?? null
            const grip = raySource?.getPrimaryControllerGrip() ?? null

            if (grip) {
                grip.add(container)
                container.position.copy(GRIP_LOCAL_OFFSET)
                return
            }

            camera.add(container)
            container.position.copy(CAMERA_LOCAL_OFFSET)
            return
        }

        this.attachWorldLocked(container, camera, scene)
    }

    /**
     * World-lock: compute a fixed world position + orientation from the camera once, right now,
     * and add the panel directly to the scene (not parented to camera/grip) so it stays put while
     * the player looks/moves around it afterward - a real per-frame follow would just be a
     * yaw-only version of camera-attach, not what "world-lock" is meant to test.
     */
    private attachWorldLocked(container: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
        // updateWorldMatrix (not updateMatrixWorld) refreshes only this object's own matrixWorld
        // from its ancestor chain, without the expense of also recursing into children - this can
        // run before the render loop has updated the frame's matrices yet (right at menu-open).
        camera.updateWorldMatrix(true, false)

        const cameraWorldPosition = new THREE.Vector3()
        camera.getWorldPosition(cameraWorldPosition)
        const cameraWorldQuaternion = new THREE.Quaternion()
        camera.getWorldQuaternion(cameraWorldQuaternion)

        // 'YXZ' extracts yaw (Y) independent of pitch (X) and roll (Z) - strips however far the
        // player was looking up/down/tilting when they opened the menu, so the panel comes in
        // upright and level rather than tilted to match their exact head angle.
        const yaw = new THREE.Euler().setFromQuaternion(cameraWorldQuaternion, 'YXZ').y
        const yawQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'))
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQuaternion)

        scene.add(container)
        container.position.copy(cameraWorldPosition).addScaledVector(forward, WORLD_LOCK_DISTANCE)
        container.quaternion.copy(yawQuaternion)
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        if (!this.active) {
            return
        }

        this.forwardedEvents?.update()
        // Component.update()'s own contract: "must only be called for the root component" - the
        // shell's own top-level Container is that root. deltaTime is already milliseconds
        // (RenderLoopRegistry's unit), matching what uikit's own update(delta) example passes.
        this.menuShell.container.update(deltaTime)

        const scene = this.getScene()
        const camera = this.getCamera()
        if (scene && camera) {
            const connected = this.syncControllerPointers(scene, camera)
            for (const { index } of connected) {
                this.controllerPointers.get(index)?.update()
            }
        }
    }

    dispose(): void {
        this.deactivate()

        this.renderLoopRegistry.unregister(this.constructor.name)

        this.eventManager.deregisterEventHandler(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.handleMenuClose)
        this.menuShell.dispose()

        this.renderer = null
    }
}
