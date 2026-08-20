/**
 * Drives one @pmndrs/pointer-events ray Pointer from a real WebXR controller, plus the visual
 * affordances a VR pointer needs that the (framework-agnostic, visual-free) pointer-events package
 * doesn't provide itself: a laser beam from the controller and a hit-highlight at whatever it's
 * currently pointing at. One instance per connected controller - see VRSettingsPanelCoordinator's
 * per-frame self-healing creation/disposal, mirroring XRControllerManager's own self-healing
 * controller-model pruning.
 *
 * Trigger down/up is wired via native WebXR 'selectstart'/'selectend' on the controller's
 * targetRaySpace directly, not through the app's gamepad-button input abstraction - simpler, and
 * exactly what three.js's own XR interaction examples do. This is independent of (and can fire
 * alongside) the existing trigger-driven game-box raycast pipeline (SceneClickGameBoxRaycast) -
 * see VRSettingsPanelCoordinator's doc comment for the accepted overlap this creates.
 *
 * The ray is always on while this instance exists (one per connected controller, only while the
 * settings menu is active - see VRSettingsPanelCoordinator's per-frame self-healing), not
 * trigger-gated - confirmed 2026-08-19 this is what a menu cursor should do; requiring a trigger
 * pull just to see where you're pointing at a UI made the menu hard to use. Trigger-gating a
 * raycast (only cast while depressed, so a beam doesn't idly sweep and cost a raycast every frame)
 * is still the right call for the real-world game-box interaction pipeline - that's a separate
 * system (SceneClickGameBoxRaycast), untouched by this class either way.
 */

import * as THREE from 'three'
import { createRayPointer } from '@pmndrs/pointer-events'
import type { GetCamera, Pointer } from '@pmndrs/pointer-events'

const BEAM_COLOR = 0x4da3ff
const BEAM_DEFAULT_LENGTH = 1.5
const HIT_MARKER_COLOR = 0x4da3ff
const HIT_MARKER_RADIUS = 0.01

// WebXR's reported targetRaySpace direction (local -Z) commonly points noticeably above the
// physical barrel for Touch-style controllers (Oculus Touch/PICO Connect - see InputProfile.ts's
// VR profile comment) - confirmed live: the beam read as aiming up and away rather than forward.
// Pitching the ray/beam's local direction down compensates. First-pass empirical value, easy to
// re-tune: adjust the degrees below and re-test in headset.
const RAY_PITCH_CORRECTION_DEGREES = -15
// Exported so tests can position targets along the real corrected direction instead of
// duplicating this rotation math.
export const RAY_DIRECTION = new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(RAY_PITCH_CORRECTION_DEGREES))

export interface VRControllerPointerOptions {
    readonly raySpace: THREE.XRTargetRaySpace
    readonly getCamera: GetCamera
    readonly intersectRoot: THREE.Object3D
    readonly scene: THREE.Scene
}

export class VRControllerPointer {
    private readonly pointer: Pointer
    private readonly raySpace: THREE.XRTargetRaySpace
    private readonly intersectRoot: THREE.Object3D
    private readonly scene: THREE.Scene

    private readonly beam: THREE.Line
    private readonly beamGeometry: THREE.BufferGeometry
    private readonly hitMarker: THREE.Mesh

    private readonly handleSelectStart = (): void => {
        this.pointer.down({ timeStamp: performance.now(), button: 0 })
    }

    private readonly handleSelectEnd = (): void => {
        this.pointer.up({ timeStamp: performance.now(), button: 0 })
    }

    constructor(options: VRControllerPointerOptions) {
        this.raySpace = options.raySpace
        this.intersectRoot = options.intersectRoot
        this.scene = options.scene

        this.pointer = createRayPointer(options.getCamera, { current: this.raySpace }, {}, { direction: RAY_DIRECTION })

        this.beamGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            RAY_DIRECTION.clone().multiplyScalar(BEAM_DEFAULT_LENGTH)
        ])
        this.beam = new THREE.Line(this.beamGeometry, new THREE.LineBasicMaterial({ color: BEAM_COLOR }))
        this.raySpace.add(this.beam)

        this.hitMarker = new THREE.Mesh(
            new THREE.SphereGeometry(HIT_MARKER_RADIUS, 12, 12),
            new THREE.MeshBasicMaterial({ color: HIT_MARKER_COLOR })
        )
        this.hitMarker.visible = false
        this.scene.add(this.hitMarker)

        // WebXRSpaceEventMap types these; controller Groups (XRTargetRaySpace) really do dispatch
        // them per the WebXR spec, independent of the app's own gamepad-button polling.
        this.raySpace.addEventListener('selectstart', this.handleSelectStart)
        this.raySpace.addEventListener('selectend', this.handleSelectEnd)
    }

    update(): void {
        this.pointer.move(this.intersectRoot, { timeStamp: performance.now() })

        // getIntersection() is never undefined once a move has happened - with nothing real hit,
        // pointer-events reports a synthetic "void object" placeholder far down the ray (radius
        // 1e10) rather than no intersection at all, so a real hit has to be distinguished
        // explicitly via isVoidObject rather than by truthiness.
        const intersection = this.pointer.getIntersection()
        if (intersection && !intersection.object.isVoidObject) {
            const length = Math.max(intersection.distance, 0)
            this.beamGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), RAY_DIRECTION.clone().multiplyScalar(length)])
            this.hitMarker.visible = true
            this.hitMarker.position.copy(intersection.point)
        } else {
            this.beamGeometry.setFromPoints([new THREE.Vector3(0, 0, 0), RAY_DIRECTION.clone().multiplyScalar(BEAM_DEFAULT_LENGTH)])
            this.hitMarker.visible = false
        }
    }

    dispose(): void {
        this.raySpace.removeEventListener('selectstart', this.handleSelectStart)
        this.raySpace.removeEventListener('selectend', this.handleSelectEnd)

        this.pointer.exit({ timeStamp: performance.now() })

        this.beam.removeFromParent()
        this.beamGeometry.dispose();
        (this.beam.material as THREE.Material).dispose()

        this.hitMarker.removeFromParent()
        this.hitMarker.geometry.dispose();
        (this.hitMarker.material as THREE.Material).dispose()
    }
}
