import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'

describe('PropRenderer — ceiling light fixtures', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propRenderer = new PropRenderer(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
    })

    it('creates fixtures just below the ceiling height', () => {
        const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16)

        expect(fixtures).toBeInstanceOf(THREE.Group)
        expect(fixtures.name).toBe('CeilingLightFixtures')

        const lightPanels = fixtures.children.find(child =>
            child instanceof THREE.InstancedMesh &&
            child.userData?.isLightFixture &&
            child.userData?.type === 'ceiling-fluorescent'
        ) as THREE.InstancedMesh

        expect(lightPanels).toBeInstanceOf(THREE.InstancedMesh)
        expect(lightPanels.count).toBe(8) // 2 rows × 4 fixtures
        expect(lightPanels.name).toBe('CeilingLightPanels')
    })

    it('creates housing around each fixture', () => {
        const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16)

        const housingInstanced = fixtures.children.find(child =>
            child instanceof THREE.InstancedMesh &&
            child.name === 'CeilingFixtureHousings'
        ) as THREE.InstancedMesh

        expect(housingInstanced).toBeInstanceOf(THREE.InstancedMesh)
        expect(housingInstanced.count).toBe(8)
    })

    it('respects custom fixture options', () => {
        const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
            rows: 3,
            fixturesPerRow: 2,
        })

        const lightPanels = fixtures.children.find(child =>
            child instanceof THREE.InstancedMesh && child.userData?.isLightFixture
        ) as THREE.InstancedMesh

        expect(lightPanels.count).toBe(6) // 3 rows × 2 fixtures
    })

    it('all meshes are named (no unnamed entries in drawCallReport)', () => {
        propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        const unnamed: string[] = []
        scene.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh && !obj.name) unnamed.push(obj.uuid)
        })
        expect(unnamed).toEqual([])
    })
})
