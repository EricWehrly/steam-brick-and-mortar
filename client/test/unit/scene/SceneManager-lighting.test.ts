import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../src/scene/PropRenderer'
import { DataManager, DataDomain } from '../../../src/core/data'

describe('SceneManager Lighting Integration', () => {
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

  describe('ceiling fixture positioning fix', () => {
    it('should position fixtures below ceiling height (fixes lighting alignment issue)', () => {
      // Test the specific bug: fixtures were at y=3.5 but ceiling is at y=3.2
      const ceilingHeight = 3.2
      propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16)
      const fixtures = scene.getObjectByName('CeilingLightFixtures') as THREE.Group

      expect(fixtures).toBeInstanceOf(THREE.Group)
      expect(fixtures.name).toBe('CeilingLightFixtures')

      const lightPanelInstanced = fixtures.children.find(child =>
        child instanceof THREE.InstancedMesh && child.userData?.isLightFixture && child.userData?.type === 'ceiling-fluorescent'
      ) as THREE.InstancedMesh
      
      expect(lightPanelInstanced).toBeDefined()
      expect(lightPanelInstanced.count).toBe(8) // 2 rows × 4 fixtures
      
      // CRITICAL FIX: All fixtures must be BELOW the ceiling
      // Check instance positions via matrix (instances positioned individually via instanceMatrix)
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      for (let i = 0; i < lightPanelInstanced.count; i++) {
        lightPanelInstanced.getMatrixAt(i, matrix)
        position.setFromMatrixPosition(matrix)
        expect(position.y).toBeLessThan(ceilingHeight)
        expect(position.y).toBeCloseTo(3.105, 2) // 3.2 - 0.075 - 0.02
        // Old broken positioning was y=3.5 (30cm above ceiling!)
        expect(position.y).not.toBeCloseTo(3.5, 1)
      }
    })

    it('should adapt positioning to different ceiling heights', () => {
      // Test with non-standard ceiling height
      const customCeilingHeight = 2.8
      propRenderer.createCeilingLightFixtures(customCeilingHeight, 22, 16)
      const fixtures = scene.getObjectByName('CeilingLightFixtures') as THREE.Group

      const lightPanelInstanced = fixtures.children.find(child =>
        child instanceof THREE.InstancedMesh && child.userData?.isLightFixture
      ) as THREE.InstancedMesh
      
      expect(lightPanelInstanced).toBeDefined()
      // Check instance positions via matrix
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      for (let i = 0; i < lightPanelInstanced.count; i++) {
        lightPanelInstanced.getMatrixAt(i, matrix)
        position.setFromMatrixPosition(matrix)
        expect(position.y).toBeLessThan(customCeilingHeight)
        expect(position.y).toBeCloseTo(2.705, 2) // 2.8 - 0.075 - 0.02
      }
    })
  })

  describe('Phase 2.4 atmospheric props', () => {
    it('should create ceiling fixtures as part of atmospheric enhancement', () => {
      // Phase 2.4: "Implement basic ceiling fixtures" 
      propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
        emissiveIntensity: 0.8,
        rows: 2,
        fixturesPerRow: 4
      })
      const fixtures = scene.getObjectByName('CeilingLightFixtures') as THREE.Group

      expect(fixtures.name).toBe('CeilingLightFixtures')

      const housingInstanced = fixtures.children.find(child =>
        child instanceof THREE.InstancedMesh && child.name === 'CeilingFixtureHousings'
      ) as THREE.InstancedMesh
      expect(housingInstanced).toBeDefined()
      expect(housingInstanced.count).toBe(8) // Housing around each light panel
    })

    it('should integrate with other atmospheric props', () => {
      // Create multiple atmospheric elements 
      propRenderer.createCeilingLightFixtures(3.2, 22, 16)
      const ceilingFixtures = scene.getObjectByName('CeilingLightFixtures') as THREE.Group
      const wireRack = propRenderer.createWireRackDisplay(new THREE.Vector3(5, 0, -3))
      const divider = propRenderer.createCategoryDivider(new THREE.Vector3(0, 0, 1))
      const floorMarkers = propRenderer.createFloorMarkers(22, 16)

      expect(ceilingFixtures).toBeInstanceOf(THREE.Group)
      expect(wireRack).toBeInstanceOf(THREE.Group)
      expect(divider).toBeInstanceOf(THREE.Group)
      expect(floorMarkers).toBeInstanceOf(THREE.Group)
      
      // All should be marked as atmospheric props (except ceiling fixtures which are lighting)
      expect(wireRack.userData.isAtmosphericProp).toBe(true)
      expect(divider.userData.isAtmosphericProp).toBe(true) 
      expect(floorMarkers.userData.isAtmosphericProp).toBe(true)
    })
  })
})
