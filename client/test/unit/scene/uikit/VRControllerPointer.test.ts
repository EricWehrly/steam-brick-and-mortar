/**
 * VRControllerPointer - drives a real @pmndrs/pointer-events ray Pointer against real three.js
 * objects (no mocking needed: unlike forwardHtmlEvents, the ray intersector needs no DOM Pointer
 * Events capture APIs, so it works fine under jsdom). Positions/matrices are set up manually with
 * updateMatrixWorld(true) since nothing here goes through a real render loop.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { VRControllerPointer } from '../../../../src/scene/uikit/VRControllerPointer'

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

    it('adds a beam to the raySpace and a hidden hit marker to the scene', () => {
        createPointer()

        expect(raySpace.children).toHaveLength(1)
        expect(raySpace.children[0]).toBeInstanceOf(THREE.Line)

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh)
        expect(hitMarker).toBeDefined()
        expect(hitMarker!.visible).toBe(false)
    })

    it('keeps the hit marker hidden when update() finds nothing interactable', () => {
        const pointer = createPointer()

        pointer.update()

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        expect(hitMarker.visible).toBe(false)
    })

    it('shows and positions the hit marker at a real intersection', () => {
        const target = createInteractableMesh()
        target.position.set(0, 0, -1)
        intersectRoot.add(target)
        intersectRoot.updateMatrixWorld(true)

        const pointer = createPointer()
        pointer.update()

        const hitMarker = scene.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        expect(hitMarker.visible).toBe(true)
        // Box is centered at z=-1 with a 0.2 side, so the near face the ray actually hits is at
        // z=-0.9, not the box's own center.
        expect(hitMarker.position.z).toBeCloseTo(-0.9, 1)
    })

    it('fires pointerdown/pointerup on selectstart/selectend while hovering a target', () => {
        const target = createInteractableMesh()
        target.position.set(0, 0, -1)
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
        target.position.set(0, 0, -1)
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
})
