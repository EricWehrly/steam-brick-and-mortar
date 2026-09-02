/**
 * Drives one @pmndrs/pointer-events ray Pointer from a real WebXR controller, plus the visual
 * affordances a VR pointer needs that the (framework-agnostic, visual-free) pointer-events package
 * doesn't provide itself: a laser beam from the controller and a hit-highlight at whatever it's
 * currently pointing at. One instance per connected controller - see UikitPointerBridge's per-frame
 * self-healing creation/disposal, mirroring XRControllerManager's own self-healing controller-model
 * pruning.
 *
 * Trigger down/up is wired via native WebXR 'selectstart'/'selectend' on the controller's
 * targetRaySpace directly, not through the app's gamepad-button input abstraction - simpler, and
 * exactly what three.js's own XR interaction examples do.
 *
 * The ray is always on while this instance exists, not trigger-gated - confirmed 2026-08-19 that
 * requiring a trigger pull just to see where you're pointing made a UI hard to use. Trigger-gating
 * a raycast is still the right call for the shelf-wide game-box pipeline (SceneClickGameBoxRaycast)
 * - that's a separate system, untouched by this class.
 */

import * as THREE from 'three'
import { createRayPointer } from '@pmndrs/pointer-events'
import type { GetCamera, Pointer } from '@pmndrs/pointer-events'
import { ALWAYS_ON_TOP_RENDER_ORDER } from './UikitRenderOrder'
import { CONTROLLER_AIM_DIRECTION } from '../../webxr/ControllerAimCorrection'

const BEAM_COLOR = 0x4da3ff
// A THREE.Line's linewidth is not honored by WebGL on most platforms (browsers clamp it to 1px
// regardless of the material property) - a thin cylinder mesh gives real, adjustable width instead.
const BEAM_RADIUS = 0.004
const BEAM_DEFAULT_LENGTH = 1.5
const HIT_MARKER_COLOR = 0x4da3ff
const HIT_MARKER_RADIUS = 0.015
// Both the beam and hit marker need to render on top of whatever they're pointing at, or they get
// depth-occluded right at the point that matters most: where the ray meets the target surface.
const ON_TOP_RENDER_ORDER = ALWAYS_ON_TOP_RENDER_ORDER + 1

/**
 * renderOrder only sorts *within* a render list, and three.js draws the whole opaque list before
 * the whole transparent one. An opaque beam therefore drew before every uikit panel no matter how
 * high its renderOrder, which is why the cursor read as being behind the menus (direct request,
 * 2026-09-02: "effectively 'behind' any menus"). Marking these transparent puts them in the same
 * list uikit's panels are in, where ON_TOP_RENDER_ORDER actually wins. depthWrite off because a
 * transparent overlay has no business occluding what's drawn after it.
 */
const ON_TOP_MATERIAL_PROPERTIES = { transparent: true, depthTest: false, depthWrite: false } as const

// CONTROLLER_AIM_DIRECTION (not a raw local -Z) - shared with XRControllerManager's shelf-box
// selection ray, so this beam always points exactly where a click would actually land. The two
// used to carry independent, differently-tuned corrections, which is why the beam and the box
// that opened could disagree (direct request, 2026-09-02) - see ControllerAimCorrection.ts.
// Re-exported so tests can position targets along the real corrected direction instead of
// duplicating this rotation math.
export const RAY_DIRECTION = CONTROLLER_AIM_DIRECTION

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

    private readonly beam: THREE.Mesh
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

        // Unit-height cylinder, translated so it spans local Y [0, 1] instead of straddling the
        // origin, then rotated so that local +Y axis points along RAY_DIRECTION - update() only
        // has to scale.y to the current length each frame, no geometry rebuild needed.
        const beamGeometry = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, 1, 8)
        beamGeometry.translate(0, 0.5, 0)
        this.beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: BEAM_COLOR, ...ON_TOP_MATERIAL_PROPERTIES }))
        this.beam.renderOrder = ON_TOP_RENDER_ORDER
        this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), RAY_DIRECTION)
        this.beam.scale.y = BEAM_DEFAULT_LENGTH
        this.raySpace.add(this.beam)

        this.hitMarker = new THREE.Mesh(
            new THREE.SphereGeometry(HIT_MARKER_RADIUS, 12, 12),
            new THREE.MeshBasicMaterial({ color: HIT_MARKER_COLOR, ...ON_TOP_MATERIAL_PROPERTIES })
        )
        this.hitMarker.renderOrder = ON_TOP_RENDER_ORDER
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
            this.beam.scale.y = Math.max(intersection.distance, 0)
            this.hitMarker.visible = true
            this.hitMarker.position.copy(intersection.point)
        } else {
            this.beam.scale.y = BEAM_DEFAULT_LENGTH
            this.hitMarker.visible = false
        }
    }

    dispose(): void {
        this.raySpace.removeEventListener('selectstart', this.handleSelectStart)
        this.raySpace.removeEventListener('selectend', this.handleSelectEnd)

        this.pointer.exit({ timeStamp: performance.now() })

        this.beam.removeFromParent()
        this.beam.geometry.dispose();
        (this.beam.material as THREE.Material).dispose()

        this.hitMarker.removeFromParent()
        this.hitMarker.geometry.dispose();
        (this.hitMarker.material as THREE.Material).dispose()
    }
}
