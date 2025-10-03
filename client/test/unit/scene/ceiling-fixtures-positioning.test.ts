/**
 * Ceiling Fixtures Positioning Tests (optional, not run by default)
 * Strict position checks for RectAreaLights and fixtures.
 * Run manually if you want to validate exact positioning.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { PropRenderer } from '../../../src/scene/PropRenderer'

describe.skip('Ceiling Fixtures Positioning (strict)', () => {
  let scene: THREE.Scene
  let propRenderer: PropRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    propRenderer = new PropRenderer(scene)
  })

  afterEach(() => {
    propRenderer.dispose()
  })

  it('should position RectAreaLights at expected Y for default ceiling', () => {
    const ceilingHeight = 3.2
    const fixtures = propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16)
    const rectLights = fixtures.children.filter(child => child instanceof THREE.RectAreaLight)
    const expectedY = ceilingHeight - 0.075 - 0.02 - 0.1 // 3.005
    rectLights.forEach(light => {
      expect(light.position.y).toBeCloseTo(expectedY, 2)
    })
  })

  it('should position RectAreaLights at expected Y for custom ceiling', () => {
    const ceilingHeight = 2.8
    const fixtures = propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16)
    const rectLights = fixtures.children.filter(child => child instanceof THREE.RectAreaLight)
    const expectedY = ceilingHeight - 0.075 - 0.02 - 0.1 // 2.605
    rectLights.forEach(light => {
      expect(light.position.y).toBeCloseTo(expectedY, 2)
    })
  })

  it('should position fixture panels at expected heights', () => {
    const ceilingHeight = 3.2
    const fixtures = propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16)
    const expectedFixtureY = ceilingHeight - 0.075 - 0.02 // 3.105
    const expectedHousingY = expectedFixtureY - 0.025 // 3.08
    
    fixtures.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.userData.isLightFixture) {
          expect(child.position.y).toBeCloseTo(expectedFixtureY, 2)
        } else if (child.geometry && child.geometry.type === 'BoxGeometry') {
          expect(child.position.y).toBeCloseTo(expectedHousingY, 2)
        }
      }
    })
  })

  it('should maintain proper spacing in fixture grid', () => {
    const roomWidth = 22
    const roomDepth = 16
    const rows = 2
    const fixturesPerRow = 4
    
    const fixtures = propRenderer.createCeilingLightFixtures(3.2, roomWidth, roomDepth, {
      rows,
      fixturesPerRow
    })

    const fixturePositions: THREE.Vector3[] = []
    
    fixtures.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isLightFixture) {
        fixturePositions.push(child.position.clone())
      }
    })

    // Sort by Z (rows) then X (columns)
    fixturePositions.sort((a, b) => a.z - b.z || a.x - b.x)

    // Expected spacing
    const expectedSpacingX = roomWidth / (fixturesPerRow + 1) // 22 / 5 = 4.4m
    const expectedSpacingZ = roomDepth / (rows + 1) // 16 / 3 = 5.33m

    // Check first row spacing
    for (let i = 1; i < fixturesPerRow; i++) {
      const spacing = fixturePositions[i].x - fixturePositions[i-1].x
      expect(spacing).toBeCloseTo(expectedSpacingX, 1)
    }

    // Check row-to-row spacing
    const rowSpacing = fixturePositions[fixturesPerRow].z - fixturePositions[0].z
    expect(rowSpacing).toBeCloseTo(expectedSpacingZ, 1)
  })
})
