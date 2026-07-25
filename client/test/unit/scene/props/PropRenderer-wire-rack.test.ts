import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'
import { DataManager, DataDomain } from '../../../../src/core/data'

describe('PropRenderer — wire rack display', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        // UserPropPlacer (constructed by PropRenderer) fetches the scene from DataManager itself.
        DataManager.getInstance().set('core.mainScene', scene, { domain: DataDomain.Scene })
        propRenderer = PropRenderer.getInstance(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
        DataManager.resetInstance()
    })

    it('creates a wire rack group at the specified position', () => {
        const position = new THREE.Vector3(5, 0, -3)
        const rack = propRenderer.createWireRackDisplay(position)

        expect(rack).toBeInstanceOf(THREE.Group)
        expect(rack.name).toBe('WireRackDisplay')
        expect(rack.position).toEqual(position)
        expect(rack.userData.type).toBe('wire-rack')
        expect(rack.userData.isAtmosphericProp).toBe(true)
    })

    it('creates vertical posts and horizontal wires', () => {
        const rack = propRenderer.createWireRackDisplay(new THREE.Vector3(0, 0, 0))
        const meshes = rack.children.filter(child => child instanceof THREE.Mesh)
        expect(meshes.length).toBeGreaterThan(4) // 4 posts + shelf wires
    })

    it('all meshes are named (no unnamed entries in drawCallReport)', () => {
        propRenderer.createWireRackDisplay(new THREE.Vector3(0, 0, 0))
        const unnamed: string[] = []
        scene.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh && !obj.name) unnamed.push(obj.uuid)
        })
        expect(unnamed).toEqual([])
    })
})
