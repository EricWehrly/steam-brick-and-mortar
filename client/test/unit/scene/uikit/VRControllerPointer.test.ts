/**
 * VRControllerPointer - drives a real @pmndrs/pointer-events ray Pointer against real three.js
 * objects (no mocking needed: unlike forwardHtmlEvents, the ray intersector needs no DOM Pointer
 * Events capture APIs, so it works fine under jsdom). Positions/matrices are set up manually with
 * updateMatrixWorld(true) since nothing here goes through a real render loop.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { VRControllerPointer, ON_TOP_RENDER_ORDER } from '../../../../src/scene/uikit/VRControllerPointer'
import { CONTROLLER_AIM_DIRECTION } from '../../../../src/webxr/ControllerAimCorrection'

/** Places a target exactly one unit along the pointer's real (pitch-corrected) ray direction,
 *  so tests hit it regardless of the exact correction angle in use. */
function positionOnRay(target: THREE.Object3D, distance = 1): void {
    target.position.copy(CONTROLLER_AIM_DIRECTION).multiplyScalar(distance)
}

// Plain THREE.Group's addEventListener/dispatchEvent types only know Object3DEventMap - real
// controller Groups (XRTargetRaySpace) are typed with WebXRSpaceEventMap's 'selectstart'/
// 'selectend', unavailable on the mocked plain Group used here (same pattern as
// XRControllerManager.test.ts's dispatchConnected/dispatchDisconnected helpers).
type LooseDispatcher = { dispatchEvent: (event: { type: string }) => void }

function dispatchSelectStart(raySpace: THREE.Object3D): void {
    (raySpace as unknown as LooseDispatcher).dispatchEvent({ type: 'selectstart' })
}

function dispatchSelectEnd(raySpace: THREE.Object3D): void {
    (raySpace as unknown as LooseDispatcher).dispatchEvent({ type: 'selectend' })
}

/** Makes a mesh a real pointer-events target - default pointerEvents is 'listener', which only
 *  intersects objects that already have a pointer listener registered. */
function createInteractableMesh(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial())
    mesh.addEventListener('pointermove', () => {})
    return mesh
}

describe('VRControllerPointer', () => {
    let raySpace: THREE.XRTargetRaySpace
    let scene: THREE.Scene
    let intersectRoot: THREE.Group
    let camera: THREE.PerspectiveCamera

    beforeEach(() => {
        raySpace = new THREE.Group() as unknown as THREE.XRTargetRaySpace
        raySpace.position.set(0, 0, 0)
        raySpace.updateMatrixWorld(true)

        scene = new THREE.Scene()
        intersectRoot = new THREE.Group()
        scene.add(intersectRoot)
        camera = new THREE.PerspectiveCamera()
    })

    function createPointer(): VRControllerPointer {
        return new VRControllerPointer({ raySpace, getCamera: () => camera, intersectRoot, scene })
    }

    it('adds a visible beam to the raySpace and a hidden hit marker to the scene - the ray is always on, not trigger-gated', () => {
        createPointer()

        expect(raySpace.children).toHaveLength(1)
        expect(raySpace.children[0]).toBeInstanceOf(THREE.Mesh)
        expect(raySpace.children[0].visible).toBe(true)

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh)
        expect(hitMarker).toBeDefined()
        expect(hitMarker!.visible).toBe(false)
    })

    it('draws both the beam and the hit marker in the transparent pass, above uikit panels - an '
        + 'opaque overlay is drawn before every transparent panel regardless of renderOrder, which '
        + 'is what put the cursor visually behind the menus it was pointing at', () => {
        createPointer()

        const beam = raySpace.children[0] as THREE.Mesh
        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh

        for (const mesh of [beam, hitMarker]) {
            const material = mesh.material as THREE.MeshBasicMaterial
            expect(material.transparent).toBe(true)
            expect(material.depthTest).toBe(false)
            expect(material.depthWrite).toBe(false)
            expect(mesh.renderOrder).toBe(ON_TOP_RENDER_ORDER)
        }
    })

    it('keeps the hit marker hidden when update() finds nothing interactable', () => {
        const pointer = createPointer()

        pointer.update()

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        expect(hitMarker.visible).toBe(false)
    })

    it('shows and positions the hit marker at a real intersection', () => {
        const target = createInteractableMesh()
        positionOnRay(target)
        intersectRoot.add(target)
        intersectRoot.updateMatrixWorld(true)

        const pointer = createPointer()
        pointer.update()

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        expect(hitMarker.visible).toBe(true)
        // The ray hits the box's near face, not its exact center - within the box's own half-size
        // of the target's placed position confirms the (pitch-corrected) ray actually reached it.
        expect(hitMarker.position.distanceTo(target.position)).toBeLessThan(0.2)
    })

    it('fires pointerdown/pointerup on selectstart/selectend while hovering a target', () => {
        const target = createInteractableMesh()
        positionOnRay(target)
        intersectRoot.add(target)
        intersectRoot.updateMatrixWorld(true)

        const pointerDown = vi.fn()
        const pointerUp = vi.fn()
        target.addEventListener('pointerdown', pointerDown)
        target.addEventListener('pointerup', pointerUp)

        const pointer = createPointer()
        pointer.update()

        dispatchSelectStart(raySpace)
        expect(pointerDown).toHaveBeenCalledTimes(1)

        dispatchSelectEnd(raySpace)
        expect(pointerUp).toHaveBeenCalledTimes(1)
    })

    it('dispose() removes the beam and hit marker and stops reacting to select events', () => {
        const target = createInteractableMesh()
        positionOnRay(target)
        intersectRoot.add(target)
        intersectRoot.updateMatrixWorld(true)

        const pointerDown = vi.fn()
        target.addEventListener('pointerdown', pointerDown)

        const pointer = createPointer()
        pointer.update()
        pointer.dispose()

        expect(raySpace.children).toHaveLength(0)
        expect(scene.children.find(child => child instanceof THREE.Mesh)).toBeUndefined()

        dispatchSelectStart(raySpace)
        expect(pointerDown).not.toHaveBeenCalled()
    })

    it('keeps raycasting across repeated update() calls without needing a trigger pull', () => {
        const target = createInteractableMesh()
        positionOnRay(target)
        intersectRoot.add(target)
        intersectRoot.updateMatrixWorld(true)

        const pointer = createPointer()
        pointer.update()
        pointer.update()
        pointer.update()

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        expect(hitMarker.visible).toBe(true)
    })
})
