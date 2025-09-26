/**
 * PropRenderer Tests
 * 
 * Tests for Phase 2.4 atmospheric props including ceiling fixtures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../src/scene/PropRenderer'

describe('PropRenderer', () => {
  let scene: THREE.Scene
  let propRenderer: PropRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    propRenderer = new PropRenderer(scene)
  })

  afterEach(() => {
    propRenderer.dispose()
  })

  describe('createCeilingLightFixtures', () => {
    it('should create fixtures just below the ceiling height', () => {
      const ceilingHeight = 3.2
      const roomWidth = 22
      const roomDepth = 16
      
      const fixtures = propRenderer.createCeilingLightFixtures(ceilingHeight, roomWidth, roomDepth)
      
      expect(fixtures).toBeInstanceOf(THREE.Group)
      expect(fixtures.name).toBe('CeilingLightFixtures')
      
      // Check that fixtures are positioned correctly (just below ceiling)
      const lightPanels = fixtures.children.filter(child => 
        child.userData?.isLightFixture && child.userData?.type === 'ceiling-fluorescent'
      )
      
      expect(lightPanels.length).toBe(8) // 2 rows × 4 fixtures
      
      // All light panels should be positioned just below ceiling
      lightPanels.forEach(panel => {
        expect(panel.position.y).toBeCloseTo(ceilingHeight - 0.075 - 0.02, 2) // height/2 + offset
        expect(panel.position.y).toBeLessThan(ceilingHeight) // Must be below ceiling
      })
    })

    it('should create housing around each fixture', () => {
      const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16)
      
      // Should have housing meshes (darker frames)
      const housingMeshes = fixtures.children.filter(child => 
        child instanceof THREE.Mesh && 
        !child.userData?.isLightFixture &&
        !(child instanceof THREE.RectAreaLight)
      )
      
      expect(housingMeshes.length).toBe(8) // One housing per fixture
    })

    it('should respect custom fixture options', () => {
      const customOptions = {
        rows: 3,
        fixturesPerRow: 2,
        width: 2.5,
        emissiveIntensity: 0.9
      }
      
      const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16, customOptions)
      
      const lightPanels = fixtures.children.filter(child => 
        child.userData?.isLightFixture
      )
      
      expect(lightPanels.length).toBe(6) // 3 rows × 2 fixtures
    })
  })

  describe('createWireRackDisplay', () => {
    it('should create a wire rack at specified position', () => {
      const position = new THREE.Vector3(5, 0, -3)
      const rack = propRenderer.createWireRackDisplay(position)
      
      expect(rack).toBeInstanceOf(THREE.Group)
      expect(rack.name).toBe('WireRackDisplay')
      expect(rack.position).toEqual(position)
      expect(rack.userData.type).toBe('wire-rack')
      expect(rack.userData.isAtmosphericProp).toBe(true)
    })

    it('should create vertical posts and horizontal wires', () => {
      const rack = propRenderer.createWireRackDisplay(new THREE.Vector3(0, 0, 0))
      
      // Should have multiple mesh components for posts and wires
      const meshes = rack.children.filter(child => child instanceof THREE.Mesh)
      expect(meshes.length).toBeGreaterThan(4) // At least 4 posts plus shelf wires
    })
  })

  describe('createCategoryDivider', () => {
    it('should create a divider at specified position and height', () => {
      const position = new THREE.Vector3(2, 0, -1)
      const height = 2.5
      const divider = propRenderer.createCategoryDivider(position, height)
      
      expect(divider).toBeInstanceOf(THREE.Group)
      expect(divider.name).toBe('CategoryDivider')
      expect(divider.position).toEqual(position)
      expect(divider.userData.type).toBe('category-divider')
      expect(divider.userData.isAtmosphericProp).toBe(true)
    })

    it('should create post and cap meshes', () => {
      const divider = propRenderer.createCategoryDivider(new THREE.Vector3(0, 0, 0), 2.2)
      
      const meshes = divider.children.filter(child => child instanceof THREE.Mesh)
      expect(meshes.length).toBe(2) // Post and cap
    })
  })

  describe('createFloorMarkers', () => {
    it('should create navigation markers for the floor', () => {
      const markers = propRenderer.createFloorMarkers(22, 16)
      
      expect(markers).toBeInstanceOf(THREE.Group)
      expect(markers.name).toBe('FloorMarkers')
      expect(markers.userData.type).toBe('floor-markers')
      expect(markers.userData.isAtmosphericProp).toBe(true)
    })

    it('should create aisle marker lines', () => {
      const markers = propRenderer.createFloorMarkers(22, 16)
      
      const planes = markers.children.filter(child => child instanceof THREE.Mesh)
      expect(planes.length).toBe(3) // Center, left, and right aisle markers
      
      // All markers should be just above floor level
      planes.forEach(plane => {
        expect(plane.position.y).toBe(0.01)
      })
    })
  })

  describe('resource management', () => {
    it('should clear all props when clearProps is called', () => {
      // Create several props
      propRenderer.createCeilingLightFixtures(3.2, 22, 16)
      propRenderer.createWireRackDisplay(new THREE.Vector3(0, 0, 0))
      propRenderer.createFloorMarkers(22, 16)
      
      const propsGroup = propRenderer.getPropsGroup()
      expect(propsGroup.children.length).toBeGreaterThan(0)
      
      propRenderer.clearProps()
      expect(propsGroup.children.length).toBe(0)
    })

    it('should remove props group from scene on dispose', () => {
      const propsGroup = propRenderer.getPropsGroup()
      expect(scene.children).toContain(propsGroup)
      
      propRenderer.dispose()
      expect(scene.children).not.toContain(propsGroup)
    })
  })
})
