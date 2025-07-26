/**
 * PropRenderer - Atmospheric Props Management
 * 
 * Handles:
 * - Ceiling light fixtures and panels
 * - Wire rack displays
 * - Category dividers and shelf separators
 * - Navigation markers and floor patterns
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../utils/Colors'

export interface LightFixtureOptions {
  width?: number
  height?: number
  depth?: number
  emissiveIntensity?: number
  rows?: number
  fixturesPerRow?: number
}

export interface WireRackOptions {
  width?: number
  height?: number
  depth?: number
  wireThickness?: number
  spacing?: number
}

export class PropRenderer {
  private scene: THREE.Scene
  private propsGroup: THREE.Group

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.propsGroup = new THREE.Group()
    this.propsGroup.name = 'AtmosphericProps'
    this.scene.add(this.propsGroup)
  }

  /**
   * Create ceiling-mounted fluorescent light fixtures
   * Positioned just below the ceiling surface for realistic appearance
   */
  public createCeilingLightFixtures(ceilingHeight: number, roomWidth: number, roomDepth: number, options: LightFixtureOptions = {}): THREE.Group {
    const {
      width = 4,
      height = 0.15,
      depth = 0.6,
      emissiveIntensity = 0.8,
      rows = 2,
      fixturesPerRow = 4
    } = options

    const fixturesGroup = new THREE.Group()
    fixturesGroup.name = 'CeilingLightFixtures'

    // Create the base fixture geometry
    const fixtureGeometry = new THREE.BoxGeometry(width, height, depth)
    
    // Create emissive material for the light panels (enhanced brightness)
    const fixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFFFF0, // Ivory (warmer and brighter than ghost white)
      emissive: 0xF0F8FF, // Alice blue glow (brighter emissive)
      emissiveIntensity: emissiveIntensity * 2.0, // Further increased for more prominence
      roughness: 0.05, // Even smoother for more reflection
      metalness: 0.02,
      transparent: true,
      opacity: 0.98 // Slightly more opaque
    })

    // Create housing material (lighter frame around light - more realistic)
    const housingMaterial = new THREE.MeshStandardMaterial({
      color: 0xD3D3D3, // Light gray (much brighter than before)
      roughness: 0.5,
      metalness: 0.4,
      emissive: 0x0A0A0A, // Subtle warm glow from housing
      emissiveIntensity: 0.1
    })

    // Position fixtures in a grid pattern across the ceiling
    const fixtureSpacingX = roomWidth / (fixturesPerRow + 1)
    const fixtureSpacingZ = roomDepth / (rows + 1)
    const fixtureY = ceilingHeight - height / 2 - 0.02 // Just below ceiling surface

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < fixturesPerRow; col++) {
        const fixtureX = -roomWidth / 2 + (col + 1) * fixtureSpacingX
        const fixtureZ = -roomDepth / 2 + (row + 1) * fixtureSpacingZ

        // Create fixture housing
        const housingGeometry = new THREE.BoxGeometry(width + 0.1, height + 0.05, depth + 0.1)
        const housing = new THREE.Mesh(housingGeometry, housingMaterial)
        housing.position.set(fixtureX, fixtureY - 0.025, fixtureZ)

        // Create light panel
        const lightPanel = new THREE.Mesh(fixtureGeometry, fixtureMaterial)
        lightPanel.position.set(fixtureX, fixtureY, fixtureZ)
        lightPanel.userData = { 
          isLightFixture: true,
          fixtureIndex: row * fixturesPerRow + col,
          type: 'ceiling-fluorescent'
        }

        fixturesGroup.add(housing)
        fixturesGroup.add(lightPanel)
      }
    }

    // Performance optimization: Use only 2 wide RectAreaLights for the two rows
    // This provides good lighting coverage while maintaining VR performance
    
    // Front row lighting (covers 4 fixtures)
    const frontRowLight = new THREE.RectAreaLight(BlockbusterColors.fluorescentCool, 4, roomWidth * 0.8, depth * 0.9)
    frontRowLight.position.set(0, fixtureY - 0.05, -roomDepth * 0.25)
    frontRowLight.lookAt(0, fixtureY - 2, -roomDepth * 0.25) // Point downward
    fixturesGroup.add(frontRowLight)
    
    // Back row lighting (covers 4 fixtures) 
    const backRowLight = new THREE.RectAreaLight(BlockbusterColors.fluorescentCool, 4, roomWidth * 0.8, depth * 0.9)
    backRowLight.position.set(0, fixtureY - 0.05, roomDepth * 0.25)
    backRowLight.lookAt(0, fixtureY - 2, roomDepth * 0.25) // Point downward
    fixturesGroup.add(backRowLight)

    this.propsGroup.add(fixturesGroup)
    console.log(`💡 Created ${rows * fixturesPerRow} ceiling-mounted fluorescent fixtures at height ${fixtureY.toFixed(2)}m with optimized lighting`)
    
    return fixturesGroup
  }

  /**
   * Create wire rack displays for snack/merchandise areas
   */
  public createWireRackDisplay(position: THREE.Vector3, options: WireRackOptions = {}): THREE.Group {
    const {
      width = 1.2,
      height = 1.8,
      depth = 0.6,
      wireThickness = 0.02,
      spacing = 0.3
    } = options

    const rackGroup = new THREE.Group()
    rackGroup.name = 'WireRackDisplay'

    // Wire material (brightened for better visibility)
    const wireMaterial = new THREE.MeshStandardMaterial({
      color: 0x808080, // Medium gray (brighter than before)
      roughness: 0.3,
      metalness: 0.7
    })

    // Create vertical posts
    const postGeometry = new THREE.CylinderGeometry(wireThickness, wireThickness, height)
    const posts = [
      new THREE.Vector3(-width/2, height/2, -depth/2),
      new THREE.Vector3(width/2, height/2, -depth/2),
      new THREE.Vector3(-width/2, height/2, depth/2),
      new THREE.Vector3(width/2, height/2, depth/2)
    ]

    posts.forEach(postPos => {
      const post = new THREE.Mesh(postGeometry, wireMaterial)
      post.position.copy(postPos)
      rackGroup.add(post)
    })

    // Create horizontal shelf wires
    const shelfCount = Math.floor(height / spacing)
    for (let i = 0; i < shelfCount; i++) {
      const shelfY = i * spacing + 0.2

      // Front-to-back wires
      const wireGeometry = new THREE.CylinderGeometry(wireThickness/2, wireThickness/2, depth)
      const leftWire = new THREE.Mesh(wireGeometry, wireMaterial)
      leftWire.rotation.x = Math.PI / 2
      leftWire.position.set(-width/2, shelfY, 0)
      rackGroup.add(leftWire)

      const rightWire = new THREE.Mesh(wireGeometry, wireMaterial)
      rightWire.rotation.x = Math.PI / 2
      rightWire.position.set(width/2, shelfY, 0)
      rackGroup.add(rightWire)

      // Side-to-side support wires
      const sideWireGeometry = new THREE.CylinderGeometry(wireThickness/2, wireThickness/2, width)
      const backWire = new THREE.Mesh(sideWireGeometry, wireMaterial)
      backWire.rotation.z = Math.PI / 2
      backWire.position.set(0, shelfY, depth/2)
      rackGroup.add(backWire)
    }

    rackGroup.position.copy(position)
    rackGroup.userData = { type: 'wire-rack', isAtmosphericProp: true }
    
    this.propsGroup.add(rackGroup)
    return rackGroup
  }

  /**
   * Create category dividers between shelf sections
   */
  public createCategoryDivider(position: THREE.Vector3, height: number = 2.2): THREE.Group {
    const dividerGroup = new THREE.Group()
    dividerGroup.name = 'CategoryDivider'

    // Main post
    const postGeometry = new THREE.BoxGeometry(0.05, height, 0.05)
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Saddle brown (wood)
      roughness: 0.6,
      metalness: 0.0
    })

    const post = new THREE.Mesh(postGeometry, postMaterial)
    post.position.set(0, height / 2, 0)
    dividerGroup.add(post)

    // Small top cap
    const capGeometry = new THREE.BoxGeometry(0.1, 0.02, 0.1)
    const cap = new THREE.Mesh(capGeometry, postMaterial)
    cap.position.set(0, height + 0.01, 0)
    dividerGroup.add(cap)

    dividerGroup.position.copy(position)
    dividerGroup.userData = { type: 'category-divider', isAtmosphericProp: true }
    
    this.propsGroup.add(dividerGroup)
    return dividerGroup
  }

  /**
   * Create subtle floor navigation markers
   */
  public createFloorMarkers(roomWidth: number, roomDepth: number): THREE.Group {
    const markersGroup = new THREE.Group()
    markersGroup.name = 'FloorMarkers'

    // Create subtle aisle center lines
    const lineGeometry = new THREE.PlaneGeometry(0.05, roomDepth * 0.8)
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555, // Darker than carpet for subtle visibility
      transparent: true,
      opacity: 0.3,
      roughness: 0.9
    })

    // Main center aisle marker
    const centerLine = new THREE.Mesh(lineGeometry, lineMaterial)
    centerLine.rotation.x = -Math.PI / 2
    centerLine.position.set(0, 0.01, 0) // Slightly above floor
    markersGroup.add(centerLine)

    // Side aisle markers
    const leftLine = new THREE.Mesh(lineGeometry, lineMaterial)
    leftLine.rotation.x = -Math.PI / 2
    leftLine.position.set(-roomWidth * 0.3, 0.01, 0)
    markersGroup.add(leftLine)

    const rightLine = new THREE.Mesh(lineGeometry, lineMaterial)
    rightLine.rotation.x = -Math.PI / 2
    rightLine.position.set(roomWidth * 0.3, 0.01, 0)
    markersGroup.add(rightLine)

    markersGroup.userData = { type: 'floor-markers', isAtmosphericProp: true }
    
    this.propsGroup.add(markersGroup)
    return markersGroup
  }

  /**
   * Get the props group for positioning or manipulation
   */
  public getPropsGroup(): THREE.Group {
    return this.propsGroup
  }

  /**
   * Clear all atmospheric props
   */
  public clearProps(): void {
    while (this.propsGroup.children.length > 0) {
      const child = this.propsGroup.children[0]
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.dispose())
        } else {
          child.material.dispose()
        }
      }
      this.propsGroup.remove(child)
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.clearProps()
    this.scene.remove(this.propsGroup)
  }
}
