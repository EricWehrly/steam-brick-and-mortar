import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'

describe('PropRenderer — ceiling light fixtures', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propRenderer = PropRenderer.getInstance(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
    })

    function getFixtureGroup(): THREE.Group {
        return scene.getObjectByName('CeilingLightFixtures') as THREE.Group
    }

    it('creates fixtures just below the ceiling height', () => {
        propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        const fixtures = getFixtureGroup()

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
        propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        const fixtures = getFixtureGroup()

        const housingInstanced = fixtures.children.find(child =>
            child instanceof THREE.InstancedMesh &&
            child.name === 'CeilingFixtureHousings'
        ) as THREE.InstancedMesh

        expect(housingInstanced).toBeInstanceOf(THREE.InstancedMesh)
        expect(housingInstanced.count).toBe(8)
    })

    it('respects custom fixture options', () => {
        propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
            rows: 3,
            fixturesPerRow: 2,
        })
        const fixtures = getFixtureGroup()

        const lightPanels = fixtures.children.find(child =>
            child instanceof THREE.InstancedMesh && child.userData?.isLightFixture
        ) as THREE.InstancedMesh

        expect(lightPanels.count).toBe(6) // 3 rows × 2 fixtures
    })

    it('returns one SceneLight per row', () => {
        const lights = propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
            rows: 3,
            fixturesPerRow: 4,
        })

        expect(lights).toHaveLength(3)
        expect(lights.every(l => typeof l.id === 'number' && l.id > 0)).toBe(true)
    })

    it('returned IDs match lights added to scene', () => {
        const lights = propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        const fixtures = getFixtureGroup()

        const sceneLightIds: number[] = []
        fixtures.traverse(child => {
            if (child instanceof THREE.RectAreaLight) sceneLightIds.push(child.id)
        })

        expect(lights).toHaveLength(sceneLightIds.length)
        expect(lights.map(l => l.id).sort()).toEqual(sceneLightIds.sort())
    })

    it('each SceneLight references the panel emissive material', () => {
        const lights = propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        const fixtures = getFixtureGroup()
        const panels = fixtures.getObjectByName('CeilingLightPanels') as THREE.InstancedMesh
        const panelMaterial = panels.material as THREE.MeshStandardMaterial

        lights.forEach(light => {
            expect(light.emissiveMaterials).toHaveLength(1)
            expect(light.emissiveMaterials[0]).toBe(panelMaterial)
        })
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
