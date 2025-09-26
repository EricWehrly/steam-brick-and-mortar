/**
 * SceneManager Lighting Tests  
 * 
 * Tests for       rectLights.forEach(light => {
        expect(light.position.y).toBeLessThan(ceilingHeight)
        expect(light.position.y).toBeCloseTo(3.005, 3) // Updated position calculation (fixtureY - 0.1)
        expect(light.position.y).toBeGreaterThan(2.5) // Reasonable height range
      })ng fixture positioning and lighting alignment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../src/scene/PropRenderer'

describe('SceneManager Lighting Integration', () => {
  let scene: THREE.Scene
  let propRenderer: PropRenderer
  
  beforeEach(() => {
    scene = new THREE.Scene()
    propRenderer = new PropRenderer(scene)
  })

  afterEach(() => {
    propRenderer.dispose()
  })

  describe('ceiling fixture positioning fix', () => {
    it('should position fixtures below ceiling height (fixes lighting alignment issue)', () => {
      // Test the specific bug: fixtures were at y=3.5 but ceiling is at y=3.2
      const ceilingHeight = 3.2
      const fixtures = propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16)
      
      expect(fixtures).toBeInstanceOf(THREE.Group)
      expect(fixtures.name).toBe('CeilingLightFixtures')
      
      // Find all light fixtures in the group  
      const lightPanels = fixtures.children.filter(child => 
        child.userData?.isLightFixture && child.userData?.type === 'ceiling-fluorescent'
      )
      
      expect(lightPanels.length).toBe(8) // 2 rows × 4 fixtures
      
      // CRITICAL FIX: All fixtures must be BELOW the ceiling
      lightPanels.forEach(panel => {
        expect(panel.position.y).toBeLessThan(ceilingHeight)
        expect(panel.position.y).toBeCloseTo(3.105, 2) // 3.2 - 0.075 - 0.02
        // Old broken positioning was y=3.5 (30cm above ceiling!)
        expect(panel.position.y).not.toBeCloseTo(3.5, 1)
      })
    })

    it('should adapt positioning to different ceiling heights', () => {
      // Test with non-standard ceiling height
      const customCeilingHeight = 2.8
      const fixtures = propRenderer.createCeilingLightFixtures(customCeilingHeight, 22, 16)
      
      const lightPanels = fixtures.children.filter(child => 
        child.userData?.isLightFixture
      )
      
      lightPanels.forEach(panel => {
        expect(panel.position.y).toBeLessThan(customCeilingHeight)
        expect(panel.position.y).toBeCloseTo(2.705, 2) // 2.8 - 0.075 - 0.02
      })
    })
  })

  describe('Phase 2.4 atmospheric props', () => {
    it('should create ceiling fixtures as part of atmospheric enhancement', () => {
      // Phase 2.4: "Implement basic ceiling fixtures" 
      const fixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
        emissiveIntensity: 0.8, // Enhanced visibility for atmosphere
        rows: 2,
        fixturesPerRow: 4
      })
      
      expect(fixtures.name).toBe('CeilingLightFixtures')
      
      // Should create proper housing for realistic appearance
      const housingMeshes = fixtures.children.filter(child => 
        child instanceof THREE.Mesh && !child.userData?.isLightFixture
      )
      expect(housingMeshes.length).toBe(8) // Housing around each light panel
    })

    it('should integrate with other atmospheric props', () => {
      // Create multiple atmospheric elements 
      const ceilingFixtures = propRenderer.createCeilingLightFixtures(3.2, 22, 16)
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
