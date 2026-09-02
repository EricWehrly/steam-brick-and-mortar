import * as THREE from 'three'
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js'
import { DataManager } from '../core/data/DataManager'
import { DataDomain, DataKey } from '../core/data/DataTypes'
import { Logger } from '../utils/Logger'

// Three distinct "ray"-adjacent concepts live in this file and its consumers, easy to conflate
// under a shared "ray" vocabulary (direct request, 2026-08-31 PR review - the naming was making
// this genuinely hard to follow):
//   1. XRControllerRay - an actual geometric raycasting ray (origin + direction), meant to be
//      copied straight into a THREE.Raycaster (see SceneClickGameBoxRaycast). This is the only
//      one of the three that's really "a ray."
//   2. XRControllerState - live per-controller data: which hand, its tracked pose anchor
//      (targetRaySpace), and its current analog trigger pull (0-1, NOT a ray at all - see that
//      field's own doc comment). Renamed from XRControllerRayInfo/getControllerRaySpaces(), which
//      read as ray data when the trigger value in particular has nothing to do with rays.
//   3. A visually-drawn pointer beam (a THREE.Mesh/Line in the scene) - not defined anywhere in
//      this file. If you're looking for that, it lives with whatever VR pointer/cursor renders it.

export interface XRControllerRay {
    origin: THREE.Vector3
    direction: THREE.Vector3
}

/** Live state for one connected controller - not a ray (see this file's top-of-file note). */
export interface XRControllerState {
    readonly index: number
    readonly handedness: XRHandedness
    /** The real XRTargetRaySpace - the WebXR-tracked pose anchor for "where this controller
     *  points," typed precisely (not plain Object3D) so consumers can register for its
     *  'selectstart'/'selectend'/... WebXR-specific events. This is a *pose anchor* to parent
     *  things onto or read a transform from - it does not by itself carry an origin/direction
     *  pair the way XRControllerRay does. */
    readonly targetRaySpace: THREE.XRTargetRaySpace
    /** Live analog trigger depression (xr-standard button 0), 0 (released) to 1 (fully pressed) -
     *  read fresh every call, not cached. Lets a VR pointer/cursor gate its raycast on "trigger
     *  being held at all" rather than needing a separate poll. */
    readonly triggerValue: number
}

export interface XRControllerSource {
    getPrimaryControllerRay(): XRControllerRay | null
    getPrimaryControllerGrip(): THREE.Object3D | null
    /** Every currently-connected controller's live state (see XRControllerState) - for callers
     *  that want to drive a continuous VR pointer/cursor per hand, or just count connected
     *  controllers, rather than the single trigger-resolved "primary" ray. Optional so existing
     *  XRControllerSource fixtures across the test suite don't need touching for a capability
     *  only the VR uikit pointer bridge uses so far. */
    getConnectedControllers?(): ReadonlyArray<XRControllerState>
}

export interface XRControllerManagerConfig {
    /** The camera's parent rig, not the camera itself - see SceneManager's cameraRig doc comment.
     *  Controllers are parented here for the identical reason the camera is: three.js's XR pose
     *  composition only decomposes correctly relative to a parent whose matrixWorld reflects
     *  rig-driven locomotion. */
    cameraRig: THREE.Object3D
}

const CONTROLLER_COUNT = 2
/** xr-standard mapping: button 0 is always the trigger. */
const TRIGGER_BUTTON_INDEX = 0
const CONTROLLER_FORWARD = new THREE.Vector3(0, 0, -1)

/**
 * Owns real WebXR controller pose tracking, parenting, and (for player feedback) visual models -
 * see docs/plans/vr-support-plan.md. Controller/grip Group transforms are kept live by three.js
 * internally during renderer.render() - no manual XRFrame/getPose() plumbing needed. Owned by
 * WebXRCoordinator, mirroring its existing ownership of WebXRManager/InputManager.
 */
export class XRControllerManager implements XRControllerSource {
    private static readonly logger = Logger.createLogFunctions(XRControllerManager.name)
    private readonly cameraRig: THREE.Object3D
    private readonly controllerModelFactory = new XRControllerModelFactory()
    private session: XRSession | null = null
    // XRTargetRaySpace/XRGripSpace aren't exported from three's public API - derive their types
    // from the methods that return them instead of importing the (unexported) class names.
    private readonly controllers: ReturnType<THREE.WebGLRenderer['xr']['getController']>[] = []
    private readonly controllerGrips: ReturnType<THREE.WebGLRenderer['xr']['getControllerGrip']>[] = []
    private readonly controllerModels: THREE.Object3D[] = []
    private readonly handednessByIndex: Array<XRHandedness | null> = []
    private readonly handleConnected: Array<(event: { data: XRInputSource }) => void> = []
    private readonly handleDisconnected: Array<() => void> = []

    constructor(config: XRControllerManagerConfig) {
        this.cameraRig = config.cameraRig
    }

    setup(renderer: THREE.WebGLRenderer): void {
        for (let i = 0; i < CONTROLLER_COUNT; i++) {
            const controller = renderer.xr.getController(i)
            const grip = renderer.xr.getControllerGrip(i)
            const controllerModel = this.controllerModelFactory.createControllerModel(grip)
            grip.add(controllerModel)
            this.controllerModels.push(controllerModel)

            this.handednessByIndex.push(null)

            // three.js does NOT guarantee getController(0)/getController(1) map to left/right
            // consistently - the 'connected' event's real XRInputSource is the only reliable way
            // to learn which hand occupies which index, live, per session.
            const onConnected = (event: { data: XRInputSource }): void => {
                this.handednessByIndex[i] = event.data.handedness
                XRControllerManager.logger.debug(`Controller connected: index=${i} handedness=${event.data.handedness}`)
            }
            const onDisconnected = (): void => {
                XRControllerManager.logger.debug(`Controller disconnected: index=${i} (was ${this.handednessByIndex[i] ?? 'unknown'})`)
                this.handednessByIndex[i] = null
            }
            controller.addEventListener('connected', onConnected)
            controller.addEventListener('disconnected', onDisconnected)
            this.handleConnected.push(onConnected)
            this.handleDisconnected.push(onDisconnected)

            this.cameraRig.add(controller)
            this.cameraRig.add(grip)

            this.controllers.push(controller)
            this.controllerGrips.push(grip)
        }

        DataManager.getInstance().set(DataKey.XRControllerSource, this, { domain: DataDomain.Scene })
    }

    setSession(session: XRSession | null): void {
        this.session = session
    }

    /**
     * Called every render-loop frame (by WebXRCoordinator). Prunes stale duplicate controller
     * models - three.js's own XRControllerModelFactory 'connected' handler (registered internally
     * on the grip, opaque to us) has zero guard against firing more than once before its own async
     * profile fetch resolves - observed on a controller already connected before the XR session
     * even started (fires twice back-to-back; both fetches complete later and both unconditionally
     * add their GLTF), vs. one connected mid-session (fires once, no duplicate). A connect-time
     * clear() can't fix this - if two connects fire before either fetch resolves, there's nothing
     * loaded yet to clear at connect time, and both loads land later regardless. Pruning every
     * frame instead makes "at most one child" a continuously-enforced invariant, correct
     * regardless of how the two connects' async loads interleave.
     *
     * Kept as "keep last-added" for now - a "keep first-added" attempt (on the theory that the
     * generic fallback loads first) didn't visibly fix the generic-vs-recognized-model issue on
     * real-headset re-test, still under investigation. Live-testing hypothesis worth checking
     * first: XRControllerModelFactory's profile fetch may simply never be resolving to the
     * recognized asset at all (no confirmed CDN reachability for @webxr-input-profiles/assets on
     * this Tauri/WebView2 target), which would make pruning moot regardless of which child it keeps.
     */
    update(): void {
        this.controllerModels.forEach(model => this.pruneDuplicateChildren(model))
    }

    /**
     * Prefers whichever hand's trigger is currently held (read live off the real
     * XRInputSource.gamepad - valid because EventManager.emit is synchronous, so the trigger is
     * still down when a raycast handler runs in the same tick), falling back right-then-left.
     * Returns null with no session, no connected controller, or neither trigger held and no
     * controller connected at all.
     */
    getPrimaryControllerRay(): XRControllerRay | null {
        const index = this.resolvePrimaryControllerIndex()
        if (index === null) {
            return null
        }

        const controller = this.controllers[index]
        const origin = controller.getWorldPosition(new THREE.Vector3())
        const direction = CONTROLLER_FORWARD.clone()
            .applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()))
            .normalize()

        return { origin, direction }
    }

    /**
     * Same hand-resolution as getPrimaryControllerRay(), but returns the real grip Group instead
     * of a derived ray - for callers (e.g. the game-box fold-open interaction) that want to parent
     * an object onto the hand rather than just read its aim. Null under the same conditions
     * getPrimaryControllerRay() is: no session, no connected controller, or neither trigger held
     * with nothing connected at all.
     */
    getPrimaryControllerGrip(): THREE.Object3D | null {
        const index = this.resolvePrimaryControllerIndex()
        return index === null ? null : this.controllerGrips[index]
    }

    /**
     * All connected controllers (not just the trigger-resolved "primary" one) - a VR pointer/
     * cursor needs one entry per hand, not just whichever hand getPrimaryControllerRay() would
     * pick. Each entry's triggerValue is read live, so callers can gate their own raycasting on it
     * (e.g. only casting while the trigger is at least slightly depressed) without a separate poll.
     */
    getConnectedControllers(): ReadonlyArray<XRControllerState> {
        const result: XRControllerState[] = []
        this.handednessByIndex.forEach((handedness, index) => {
            if (handedness !== null) {
                result.push({ index, handedness, targetRaySpace: this.controllers[index], triggerValue: this.getTriggerValue(handedness) })
            }
        })
        return result
    }

    /** Live analog trigger depression for the given hand, 0 if no session or no matching input
     *  source's gamepad reports one. Mirrors resolvePrimaryControllerIndex()'s inputSources scan.
     *  inputSources is an external WebXR API boundary - see DeviceDetector's identical guard for
     *  why this checks it explicitly rather than trusting a non-null session alone. */
    private getTriggerValue(handedness: XRHandedness): number {
        if (!this.session?.inputSources) {
            return 0
        }

        for (const inputSource of this.session.inputSources) {
            if (inputSource.handedness === handedness) {
                return inputSource.gamepad?.buttons[TRIGGER_BUTTON_INDEX]?.value ?? 0
            }
        }
        return 0
    }

    dispose(): void {
        this.controllers.forEach((controller, i) => {
            controller.removeEventListener('connected', this.handleConnected[i])
            controller.removeEventListener('disconnected', this.handleDisconnected[i])
            this.cameraRig.remove(controller)
        })
        this.controllerGrips.forEach(grip => this.cameraRig.remove(grip))

        this.controllers.length = 0
        this.controllerGrips.length = 0
        this.controllerModels.length = 0
        this.handednessByIndex.length = 0
        this.handleConnected.length = 0
        this.handleDisconnected.length = 0
        this.session = null
    }

    /**
     * Keeps only the most-recently-added child (see update()'s doc comment for why "most recent"
     * is the current choice), disposing the geometry/material of anything pruned so repeated
     * duplicate loads don't leak GPU resources. It's only a backstop for a race in three.js's own
     * XRControllerModelFactory (see update()'s doc comment) that may not reproduce every session.
     */
    private pruneDuplicateChildren(model: THREE.Object3D): void {
        while (model.children.length > 1) {
            XRControllerManager.logger.debug(
                `Pruning duplicate controller model "${model.children[0].name || model.children[0].uuid}" `
                + `(${model.children.length} children before prune)`
            )
            const stale = model.children[0]
            model.remove(stale)
            stale.traverse(child => {
                if (!(child instanceof THREE.Mesh)) {
                    return
                }
                child.geometry.dispose()
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                materials.forEach(material => material.dispose())
            })
        }
    }

    private resolvePrimaryControllerIndex(): number | null {
        // inputSources is an external WebXR API boundary - see DeviceDetector's identical guard
        // for why this checks it explicitly rather than trusting a non-null session alone.
        if (!this.session?.inputSources) {
            return null
        }

        for (const inputSource of this.session.inputSources) {
            if (inputSource.gamepad?.buttons[TRIGGER_BUTTON_INDEX]?.pressed) {
                const index = this.handednessByIndex.indexOf(inputSource.handedness)
                if (index !== -1) {
                    return index
                }
            }
        }

        const rightIndex = this.handednessByIndex.indexOf('right')
        if (rightIndex !== -1) {
            return rightIndex
        }

        return this.handednessByIndex.indexOf('left') !== -1 ? this.handednessByIndex.indexOf('left') : null
    }
}
