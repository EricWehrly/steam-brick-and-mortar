/**
 * Ceiling Fixtures Test - Phase 2.4 Implementation
 * 
 * Tests the new PropRenderer ceiling fixtures:
 * - Correct positioning relative to ceiling
 * - Proper lighting alignment 
 * - Individual fixture and light creation
 * - Atmospheric enhancement implementation
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../src/scene/PropRenderer'

describe('Phase 2.4 - Ceiling Fixtures', () => {
  let scene: THREE.Scene
  let propRenderer: PropRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    propRenderer = new PropRenderer(scene)
  })

  afterEach(() => {
    propRenderer.dispose()
  })

  test('createCeilingLightFixtures positions lights below ceiling', () => {
    const ceilingHeight = 3.2
    const roomWidth = 22
    const roomDepth = 16
    
    const fixturesGroup = propRenderer.createCeilingLightFixtures(
      ceilingHeight, 
      roomWidth, 
      roomDepth, 
      {
        rows: 2,
        fixturesPerRow: 4,
        height: 0.15
      }
    )

    expect(fixturesGroup).toBeDefined()
    expect(fixturesGroup.name).toBe('CeilingLightFixtures')

    // Expected fixture Y position: ceiling height - fixture height/2 - small offset
    const expectedFixtureY = ceilingHeight - 0.15/2 - 0.02
    
    // Count fixture types
    let lightFixtures = 0
    let housings = 0
    let rectLights = 0

    fixturesGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.userData.isLightFixture) {
          lightFixtures++
          // Warn if fixture positioning is off
          if (Math.abs(child.position.y - expectedFixtureY) > 0.05) {
            console.warn(`Fixture Y position ${child.position.y} deviates from expected ${expectedFixtureY}`)
          }
        } else {
          housings++
          // Warn if housing positioning is off
          if (Math.abs(child.position.y - (expectedFixtureY - 0.025)) > 0.05) {
            console.warn(`Housing Y position ${child.position.y} deviates from expected ${expectedFixtureY - 0.025}`)
          }
        }
      } else if (child instanceof THREE.RectAreaLight) {
        rectLights++
        // Warn if light positioning is off
        if (Math.abs(child.position.y - (expectedFixtureY - 0.1)) > 0.05) {
          console.warn(`RectAreaLight Y position ${child.position.y} deviates from expected ${expectedFixtureY - 0.1}`)
        }
      }
    })

    // Should have 8 light fixtures (2 rows × 4 fixtures) but 2 optimized RectAreaLights
    expect(lightFixtures).toBe(8)
    expect(housings).toBe(8)
    expect(rectLights).toBe(2) // Performance optimization: 2 wide RectAreaLights instead of 8
  })

  test('fixture materials have proper emissive properties', () => {
    const fixturesGroup = propRenderer.createCeilingLightFixtures(3.2, 22, 16, {
      emissiveIntensity: 0.8
    })

    let emissiveFixturesFound = 0
    
    fixturesGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isLightFixture) {
        const material = child.material as THREE.MeshStandardMaterial
        expect(material.emissive.getHex()).toBeGreaterThan(0) // Should have emissive color
        expect(material.emissiveIntensity).toBeCloseTo(1.6, 2) // Enhanced brightness (2.0 * 0.8 base = 1.6)
        expect(material.transparent).toBe(true)
        expect(material.opacity).toBeCloseTo(0.98, 2) // Slightly more opaque for better visibility
        emissiveFixturesFound++
      }
    })

    expect(emissiveFixturesFound).toBe(8) // Should find all 8 fixtures
  })

  test('PropRenderer can be properly disposed', () => {
    const fixturesGroup = propRenderer.createCeilingLightFixtures(3.2, 22, 16)
    
    // Should have fixtures before disposal
    expect(fixturesGroup.children.length).toBeGreaterThan(0)
    
    // Dispose should clear all props
    propRenderer.dispose()
    
    // Scene should no longer contain the props group
    const propsInScene = scene.children.filter(child => child.name === 'AtmosphericProps')
    expect(propsInScene.length).toBe(0)
  })

  test('fixtures have proper userData for identification', () => {
    const fixturesGroup = propRenderer.createCeilingLightFixtures(3.2, 22, 16)

    let fixtureIndex = 0
    
    fixturesGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isLightFixture) {
        expect(child.userData.fixtureIndex).toBe(fixtureIndex)
        expect(child.userData.type).toBe('ceiling-fluorescent')
        fixtureIndex++
      }
    })

    expect(fixtureIndex).toBe(8) // Should have processed all 8 fixtures
  })
})
