import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'

describe('PropRenderer — category dividers', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propRenderer = new PropRenderer(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
    })

    it('creates a divider group at the specified position', () => {
        const position = new THREE.Vector3(2, 0, -1)
        const divider = propRenderer.createCategoryDivider(position, 2.5)

        expect(divider).toBeInstanceOf(THREE.Group)
        expect(divider.name).toBe('CategoryDivider')
        expect(divider.position).toEqual(position)
        expect(divider.userData.type).toBe('category-divider')
        expect(divider.userData.isAtmosphericProp).toBe(true)
    })

    it('creates a post and a cap mesh', () => {
        const divider = propRenderer.createCategoryDivider(new THREE.Vector3(0, 0, 0), 2.2)
        const meshes = divider.children.filter(child => child instanceof THREE.Mesh)
        expect(meshes.length).toBe(2)
    })

    it('all meshes are named (no unnamed entries in drawCallReport)', () => {
        propRenderer.createCategoryDivider(new THREE.Vector3(0, 0, 0))
        const unnamed: string[] = []
        scene.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh && !obj.name) unnamed.push(obj.uuid)
        })
        expect(unnamed).toEqual([])
    })
})
