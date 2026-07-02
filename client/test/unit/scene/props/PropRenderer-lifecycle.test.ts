import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../../src/scene/PropRenderer'

describe('PropRenderer — resource management', () => {
    let scene: THREE.Scene
    let propRenderer: PropRenderer

    beforeEach(() => {
        scene = new THREE.Scene()
        propRenderer = PropRenderer.getInstance(scene)
    })

    afterEach(() => {
        propRenderer.dispose()
    })

    it('clearProps removes all children from the props group', () => {
        propRenderer.createCeilingLightFixtures(3.2, 22, 16)
        propRenderer.createWireRackDisplay(new THREE.Vector3(0, 0, 0))
        propRenderer.createFloorMarkers(22, 16)

        const propsGroup = propRenderer.getPropsGroup()
        expect(propsGroup.children.length).toBeGreaterThan(0)

        propRenderer.clearProps()
        expect(propsGroup.children.length).toBe(0)
    })

    it('dispose removes the props group from the scene', () => {
        const propsGroup = propRenderer.getPropsGroup()
        expect(scene.children).toContain(propsGroup)

        propRenderer.dispose()
        expect(scene.children).not.toContain(propsGroup)
    })
})
