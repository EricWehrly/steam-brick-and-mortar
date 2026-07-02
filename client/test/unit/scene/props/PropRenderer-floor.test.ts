import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'

describe('PropRenderer — floor markers and entrance mat', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propRenderer = PropRenderer.getInstance(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
    })

    it('creates a floor markers group with correct metadata', () => {
        const markers = propRenderer.createFloorMarkers(22, 16)

        expect(markers).toBeInstanceOf(THREE.Group)
        expect(markers.name).toBe('FloorMarkers')
        expect(markers.userData.type).toBe('floor-markers')
        expect(markers.userData.isAtmosphericProp).toBe(true)
    })

    it('creates center and side aisle marker lines above the floor', () => {
        const markers = propRenderer.createFloorMarkers(22, 16)
        const planes = markers.children.filter(child => child instanceof THREE.Mesh)

        expect(planes.length).toBe(3) // center, left, right
        planes.forEach(plane => {
            expect(plane.position.y).toBe(0.01)
        })
    })

    it('all floor marker meshes are named', () => {
        propRenderer.createFloorMarkers(10, 10)
        const unnamed: string[] = []
        scene.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh && !obj.name) unnamed.push(obj.uuid)
        })
        expect(unnamed).toEqual([])
    })

    it('entrance mat mesh is named', () => {
        const group = propRenderer.createEntranceFloorMat(10, 10)
        const unnamed: string[] = []
        group.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh && !obj.name) unnamed.push(obj.uuid)
        })
        expect(unnamed).toEqual([])
    })
})
