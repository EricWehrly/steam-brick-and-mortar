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
 * coordinator's job is purely anchoring + pointer lifecycle, not panel content. Interaction (mouse
 * on the canvas for flatscreen testing, one ray pointer per WebXR controller) is a
 * UikitPointerBridge scoped to the shell's container. Trigger down/up for the controllers is native
 * WebXR 'selectstart'/'selectend', independent of the
 * app's own gamepad-button input abstraction - see VRControllerPointer's doc comment. A VR trigger
 * pull also still fires the app's own gamepad-button-driven InteractPressed in parallel, but
 * SystemUICoordinator.handleInteractPressed no-ops while any menu is open, so it can't reach
 * through this panel to select a game box behind it.
 *
 * Shows/hides on the same UIEventTypes.MenuOpen/MenuClose events the DOM pause menu already
 * drives (see SystemUICoordinator's handlePauseMenuOpened/Closed) - VR's "Menu Button" already
 * flows into these via PauseMenuManager, so no new input wiring was needed.
 *
 * Which surface you actually get is decided by whether you're in a headset (direct request,
 * 2026-09-02: "get the vr uikit menu to open when we open settings in vr ... and leave old
 * settings menu when not in vr"). Two independent facts drive that - is a pause menu open, and is
 * an immersive session presenting (WebXREventTypes.SessionStart/SessionEnd) - reconciled by
 * syncVisibility() rather than either one activating directly, so entering or leaving VR with the
 * menu already open lands on the right surface instead of only being handled at open time. In VR
 * the DOM pause menu is still open underneath and deliberately not suppressed: it isn't visible
 * inside an immersive session anyway (a DOM layer is never submitted through XRWebGLLayer), its
 * state machine is what VRSettingsMenuShell's tab sync reads, and leaving it alone is what makes
 * exiting VR mid-menu land back on a correct DOM menu.
 *
 * setShowOnFlatscreen() lifts the VR requirement - that's ?forceVRSettingsPanel=1's job, and the
 * only way to look at this panel without a headset. This class has no knowledge of that flag or of
 * PauseMenuManager: it's told, the same way PauseMenuManager.setDomVisualsSuppressed() is told.
 * Activation still requires a real MenuOpen either way. A previous version pre-activated
 * independently at init() when forced, which desynced this panel's active state from
 * PauseMenuManager's real isOpen (confirmed live 2026-08-20: the VR panel would already be showing
 * at load, so the first real Settings/OpenMenu press - which PauseMenuManager saw as "opening" a
 * menu it thought was closed - looked like a no-op, and the *second* press was the one that
 * actually closed anything). SystemUICoordinator instead calls the real pauseMenuManager.open()
 * once at startup when forced, so both surfaces open through the exact same path.
 *
 * Anchor strategy (settled 2026-08-19 via live headset testing, see
 * docs/plans/vr-uikit-menu-migration-plan.md) is switchable via VRPanelAnchorMode:
 * 'camera-attached' (default - moves with the player's head, like a HUD) won out over
 * 'world-lock' (pinned to a fixed point in front of the player at open time) and 'grip-attached'
 * (follows the primary controller - swings while you point at it with the same hand). The losing
 * modes are kept, not deleted, in case a future panel shape wants a different anchor.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { AppSettings } from '../../core/AppSettings'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { UIEventTypes, WebXREventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../types/InteractionEvents'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import type { XRControllerSource } from '../../webxr/XRControllerManager'
import { VRSettingsMenuShell } from './VRSettingsMenuShell'
import { UikitPointerBridge, type ForwardEventsFn } from './UikitPointerBridge'

// Same "held in front of the viewer" convention GameBoxFoldCoordinator uses, but further out
// (was -0.6, matching parity with the game box) - the panel itself grew (see
// VRSettingsMenuShell's CONTENT_WIDTH/SHELL_HEIGHT) per direct request ("the settings menu can be
// taller ... maybe we should get away with it being a little further away and generally bigger"),
// and a bigger panel held at the old distance would dominate the view.
const CAMERA_LOCAL_OFFSET = new THREE.Vector3(0, 0, -0.9)
const GRIP_LOCAL_OFFSET = new THREE.Vector3(0, 0.05, -0.3)
// Distance in front of the player the panel world-locks to at open time - matches
// CAMERA_LOCAL_OFFSET's magnitude so the two modes place the panel at the same initial distance.
const WORLD_LOCK_DISTANCE = 0.9

/** Which fixed point the VR settings panel is anchored to while open. 'camera-attached' (default,
 *  settled 2026-08-19) parents it to the camera so it moves with the player's head like a HUD -
 *  the winner of a live headset A/B against the other two modes, kept below for a future panel
 *  that might want a different anchor. 'world-lock' pins it to a point in front of the player
 *  computed once at open time, so it stays still in the world while they look/move around it.
 *  'grip-attached' follows the primary controller. See the constructor's anchorMode parameter to
 *  switch. */
export type VRPanelAnchorMode = 'camera-attached' | 'world-lock' | 'grip-attached'
// 'camera-attached' - the 2026-08-19 A/B winner - is what this whole settings menu keeps using.
// The world-lock trial (2026-08-20) was a misunderstanding: it was meant to try the *Category
// Reference* content as a standalone world-positioned panel, not to change how the main settings
// menu anchors - see VRCategoryReferenceCoordinator.ts, which owns that trial instead and doesn't
// touch this constant.
const DEFAULT_ANCHOR_MODE: VRPanelAnchorMode = 'camera-attached'

export class VRSettingsPanelCoordinator {
    private readonly eventManager: EventManager
    private readonly appSettings: AppSettings
    private readonly renderLoopRegistry: RenderLoopRegistry
    private readonly anchorMode: VRPanelAnchorMode

    private readonly menuShell: VRSettingsMenuShell
    private readonly pointerBridge: UikitPointerBridge

    private active = false

    // The two facts syncVisibility() reconciles - tracked rather than acted on directly, so either
    // one changing while the other already holds lands on the right surface.
    private menuOpen = false
    private inImmersiveSession = false
    private showOnFlatscreen = false

    private resolvedScene: THREE.Scene | null = null
    private resolvedCamera: THREE.Camera | null = null

    constructor(
        eventManager: EventManager,
        appSettings: AppSettings,
        forwardEvents?: ForwardEventsFn,
        anchorMode: VRPanelAnchorMode = DEFAULT_ANCHOR_MODE
    ) {
        this.eventManager = eventManager
        this.appSettings = appSettings
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        this.anchorMode = anchorMode
        this.menuShell = new VRSettingsMenuShell(eventManager, appSettings)
        this.pointerBridge = new UikitPointerBridge(this.menuShell.container, forwardEvents)

        this.eventManager.registerEventHandler<MenuOpenEvent>(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.registerEventHandler<MenuCloseEvent>(UIEventTypes.MenuClose, this.handleMenuClose)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionStart, this.handleXRSessionStart)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionEnd, this.handleXRSessionEnd)
    }

    /** Lets this panel show outside a headset too - ?forceVRSettingsPanel=1's job, and the only way
     *  to look at it without one. Off by default: on flatscreen the DOM pause menu is the menu. */
    setShowOnFlatscreen(showOnFlatscreen: boolean): void {
        this.showOnFlatscreen = showOnFlatscreen
        this.syncVisibility()
    }

    init(): void {
        this.renderLoopRegistry.register(this.constructor.name, this.update)
    }

    private readonly handleMenuOpen = (event: CustomEvent<MenuOpenEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            return
        }
        this.menuOpen = true
        this.syncVisibility()
    }

    private readonly handleMenuClose = (event: CustomEvent<MenuCloseEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            return
        }
        this.menuOpen = false
        this.syncVisibility()
    }

    private readonly handleXRSessionStart = (): void => {
        this.inImmersiveSession = true
        this.syncVisibility()
    }

    private readonly handleXRSessionEnd = (): void => {
        this.inImmersiveSession = false
        this.syncVisibility()
    }

    /** The single place "should this panel be showing right now?" is decided. activate() and
     *  deactivate() are both idempotent, so this can run on every input change without tracking
     *  which one moved. */
    private syncVisibility(): void {
        if (this.menuOpen && (this.inImmersiveSession || this.showOnFlatscreen)) {
            this.activate()
        } else {
            this.deactivate()
        }
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
        if (!scene || !camera) {
            console.warn('VRSettingsPanelCoordinator: scene/camera not ready yet, skipping activation')
            return
        }

        this.attachToAnchor(this.menuShell.container, camera, scene)
        this.pointerBridge.attach()

        this.active = true
    }

    private deactivate(): void {
        if (!this.active) {
            return
        }

        this.pointerBridge.detach()

        // Hide rather than remove from the scene graph - re-parenting a uikit root on every
        // open/close (Object3D.add() unconditionally calls removeFromParent() first, even when
        // re-adding to the object it's already a child of) is unnecessary churn on an object
        // that's about to come right back with the same anchor almost every time. attachToAnchor()
        // only actually reparents when the target genuinely changed.
        this.menuShell.container.visible = false

        this.active = false
    }

    /** Adds container to target only if it isn't already that target's child - Object3D.add()
     *  unconditionally calls removeFromParent() first, even when re-adding to the same parent, so
     *  skipping the redundant call avoids detach/reattach churn on every open of the common case
     *  (same anchor target as last time). */
    private attachIfNeeded(container: THREE.Object3D, target: THREE.Object3D): void {
        if (container.parent !== target) {
            target.add(container)
        }
    }

    private attachToAnchor(container: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void {
        // Logged every activation, on purpose - this is a live A/B still being evaluated in
        // headset (see the class doc comment and docs/plans/vr-uikit-menu-migration-plan.md's
        // anchoring decision), not settled behavior. Flip DEFAULT_ANCHOR_MODE (or pass an
        // explicit anchorMode to the constructor) to compare the two.
        console.log(`VRSettingsPanelCoordinator: anchoring panel via '${this.anchorMode}'.`)
        container.visible = true

        if (this.anchorMode === 'camera-attached') {
            this.attachIfNeeded(container, camera)
            container.position.copy(CAMERA_LOCAL_OFFSET)
            return
        }

        if (this.anchorMode === 'grip-attached') {
            const raySource = DataManager.getInstance().get<XRControllerSource>(DataKey.XRControllerSource) ?? null
            const grip = raySource?.getPrimaryControllerGrip() ?? null

            if (grip) {
                this.attachIfNeeded(container, grip)
                container.position.copy(GRIP_LOCAL_OFFSET)
                return
            }

            this.attachIfNeeded(container, camera)
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

        this.attachIfNeeded(container, scene)
        container.position.copy(cameraWorldPosition).addScaledVector(forward, WORLD_LOCK_DISTANCE)
        container.quaternion.copy(yawQuaternion)
    }

    private readonly update = (_now: number, deltaTime: number): void => {
        if (!this.active) {
            return
        }

        // Retries until the renderer exists; a no-op once attached.
        this.pointerBridge.attach()
        this.pointerBridge.update()
        // Component.update()'s own contract: "must only be called for the root component" - the
        // shell's own top-level Container is that root. deltaTime is already milliseconds
        // (RenderLoopRegistry's unit), matching what uikit's own update(delta) example passes.
        this.menuShell.container.update(deltaTime)
    }

    dispose(): void {
        this.deactivate()

        this.renderLoopRegistry.unregister(this.constructor.name)

        this.eventManager.deregisterEventHandler(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.handleMenuClose)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionStart, this.handleXRSessionStart)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionEnd, this.handleXRSessionEnd)
        this.menuShell.dispose()
    }
}
