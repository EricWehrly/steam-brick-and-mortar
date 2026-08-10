import * as THREE from 'three'
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js'
import { DataManager } from '../core/data/DataManager'
import { DataDomain, DataKey } from '../core/data/DataTypes'

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

/**
 * Owns real WebXR controller pose tracking, parenting, and (for player feedback) visual models -
 * see docs/plans/vr-support-plan.md. Controller/grip Group transforms are kept live by three.js
 * internally during renderer.render() - no manual XRFrame/getPose() plumbing needed. Owned by
 * WebXRCoordinator, mirroring its existing ownership of WebXRManager/InputManager.
 */
export class XRControllerManager implements XRControllerRaySource {
    private readonly cameraRig: THREE.Object3D
    private readonly controllerModelFactory = new XRControllerModelFactory()
    private session: XRSession | null = null
    // XRTargetRaySpace/XRGripSpace aren't exported from three's public API - derive their types
    // from the methods that return them instead of importing the (unexported) class names.
    private readonly controllers: ReturnType<THREE.WebGLRenderer['xr']['getController']>[] = []
    private readonly controllerGrips: ReturnType<THREE.WebGLRenderer['xr']['getControllerGrip']>[] = []
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
            grip.add(this.controllerModelFactory.createControllerModel(grip))

            this.handednessByIndex.push(null)

            // three.js does NOT guarantee getController(0)/getController(1) map to left/right
            // consistently - the 'connected' event's real XRInputSource is the only reliable way
            // to learn which hand occupies which index, live, per session.
            const onConnected = (event: { data: XRInputSource }): void => {
                this.handednessByIndex[i] = event.data.handedness
            }
            const onDisconnected = (): void => {
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
        this.handednessByIndex.length = 0
        this.handleConnected.length = 0
        this.handleDisconnected.length = 0
        this.session = null
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
