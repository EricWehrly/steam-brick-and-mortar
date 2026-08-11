import * as THREE from 'three'
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js'
import { DataManager } from '../core/data/DataManager'
import { DataDomain, DataKey } from '../core/data/DataTypes'
import { Logger } from '../utils/Logger'

export interface XRControllerRay {
    origin: THREE.Vector3
    direction: THREE.Vector3
}

export interface XRControllerRaySource {
    getPrimaryControllerRay(): XRControllerRay | null
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

/** The subset of @webxr-input-profiles/motion-controllers' MotionController shape this class
 *  reads - not re-exported by three's XRControllerModelFactory, so read defensively via a local
 *  structural type instead of importing it. */
interface MotionControllerLike {
    components: Record<string, { visualResponses: Record<string, { valueNode: THREE.Object3D | null }> }>
}

/** XRControllerModel (returned by createControllerModel) isn't exported from three's public API
 *  either - this is the one field on it this class reads. */
interface ControllerModelLike extends THREE.Object3D {
    motionController?: MotionControllerLike | null
}

/**
 * Owns real WebXR controller pose tracking, parenting, and (for player feedback) visual models -
 * see docs/plans/vr-support-plan.md. Controller/grip Group transforms are kept live by three.js
 * internally during renderer.render() - no manual XRFrame/getPose() plumbing needed. Owned by
 * WebXRCoordinator, mirroring its existing ownership of WebXRManager/InputManager.
 */
export class XRControllerManager implements XRControllerRaySource {
    private static readonly logger = Logger.createLogFunctions(XRControllerManager.name)
    private readonly cameraRig: THREE.Object3D
    private readonly controllerModelFactory = new XRControllerModelFactory()
    private session: XRSession | null = null
    // XRTargetRaySpace/XRGripSpace aren't exported from three's public API - derive their types
    // from the methods that return them instead of importing the (unexported) class names.
    private readonly controllers: ReturnType<THREE.WebGLRenderer['xr']['getController']>[] = []
    private readonly controllerGrips: ReturnType<THREE.WebGLRenderer['xr']['getControllerGrip']>[] = []
    private readonly controllerModels: ControllerModelLike[] = []
    private readonly handednessByIndex: Array<XRHandedness | null> = []
    private readonly handleConnected: Array<(event: { data: XRInputSource }) => void> = []
    private readonly handleDisconnected: Array<() => void> = []
    /** Indices already logged by logMotionControllerOnceReady - once per connect, not once ever,
     *  so reconnecting a controller (new profile, new components) logs fresh data again. */
    private readonly loggedMotionControllerForIndex = new Set<number>()

    constructor(config: XRControllerManagerConfig) {
        this.cameraRig = config.cameraRig
    }

    setup(renderer: THREE.WebGLRenderer): void {
        for (let i = 0; i < CONTROLLER_COUNT; i++) {
            const controller = renderer.xr.getController(i)
            const grip = renderer.xr.getControllerGrip(i)
            const controllerModel = this.controllerModelFactory.createControllerModel(grip) as ControllerModelLike
            grip.add(controllerModel)
            this.controllerModels.push(controllerModel)

            this.handednessByIndex.push(null)

            // three.js does NOT guarantee getController(0)/getController(1) map to left/right
            // consistently - the 'connected' event's real XRInputSource is the only reliable way
            // to learn which hand occupies which index, live, per session.
            const onConnected = (event: { data: XRInputSource }): void => {
                this.handednessByIndex[i] = event.data.handedness
                this.loggedMotionControllerForIndex.delete(i)
                XRControllerManager.logger.info(`Controller connected: index=${i} handedness=${event.data.handedness}`)
            }
            const onDisconnected = (): void => {
                XRControllerManager.logger.info(`Controller disconnected: index=${i} (was ${this.handednessByIndex[i] ?? 'unknown'})`)
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

        DataManager.getInstance().set(DataKey.XRControllerRaySource, this, { domain: DataDomain.Scene })
    }

    setSession(session: XRSession | null): void {
        this.session = session
    }

    /**
     * Called every render-loop frame (by WebXRCoordinator). Two jobs, both because three.js's own
     * XRControllerModelFactory 'connected' handler (registered internally on the grip, opaque to
     * us) has zero guard against firing more than once before its own async profile fetch
     * resolves - observed on a controller already connected before the XR session even started
     * (fires twice back-to-back; both fetches complete later and both unconditionally add their
     * GLTF), vs. one connected mid-session (fires once, no duplicate):
     *
     * 1. Prune stale duplicate models. A connect-time clear() can't fix this - if two connects
     *    fire before either fetch resolves, there's nothing loaded yet to clear at connect time,
     *    and both loads land later regardless. Pruning every frame instead makes "at most one
     *    child" a continuously-enforced invariant, correct regardless of how the two connects'
     *    async loads interleave: whichever connect's fetch chain resolves LAST is unconditionally
     *    the one both its `motionController` assignment and its `add()` call belong to (same
     *    synchronous continuation), so keeping only the most-recently-added child always matches
     *    the current `motionController` too.
     * 2. Log once (per connect) whether the resolved model's motionController is animation-ready -
     *    see logMotionControllerOnceReady's doc comment.
     */
    update(): void {
        this.controllerModels.forEach((model, index) => {
            this.pruneDuplicateChildren(model)
            this.logMotionControllerOnceReady(index, model)
        })
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
        this.loggedMotionControllerForIndex.clear()
        this.session = null
    }

    /** Keeps only the most-recently-added child (see update()'s doc comment for why "most recent"
     *  is always correct), disposing the geometry/material of anything pruned so repeated
     *  duplicate loads don't leak GPU resources. */
    private pruneDuplicateChildren(model: THREE.Object3D): void {
        while (model.children.length > 1) {
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

    /**
     * Once per connect (see onConnected's loggedMotionControllerForIndex.delete), logs whether
     * each of the resolved profile's components has a fully-resolved visual response node -
     * XRControllerModel.updateMatrixWorld already drives trigger/thumbstick/button animations
     * automatically every frame purely from motionController.components, no app code needed, but
     * SILENTLY skips any component whose GLTF asset is missing the expected animation node (the
     * "Could not find xr_standard_squeeze_pressed_min in the model" console warnings are exactly
     * this - a real gap in that specific asset, not a bug in our integration). This makes that
     * gap visible per-component instead of guessing from console noise.
     */
    private logMotionControllerOnceReady(index: number, model: ControllerModelLike): void {
        if (this.loggedMotionControllerForIndex.has(index) || !model.motionController) {
            return
        }
        this.loggedMotionControllerForIndex.add(index)

        const summary = Object.entries(model.motionController.components)
            .map(([name, component]) => {
                const responses = Object.values(component.visualResponses)
                const resolved = responses.filter(response => response.valueNode).length
                return `${name}(${resolved}/${responses.length})`
            })
            .join(', ')

        XRControllerManager.logger.info(`Controller model animation-ready: index=${index} components=[${summary}]`)
    }

    private resolvePrimaryControllerIndex(): number | null {
        if (!this.session) {
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
