/**
 * PropRenderer - Atmospheric Props Management
 * 
 * Handles:
 * - Ceiling light fixtures and panels
 * - Wire rack displays
 * - Category dividers and shelf separators
 * - Navigation markers and floor patterns
 * 
 * Note: Planned to be merged into legacy/GPU system bifurcation (see tech-debt.md)
 */

import * as THREE from 'three'
import { BlockbusterColors } from '../utils/Colors'
import { LightFactory } from '../lighting/LightFactory'
import { PerformanceMonitor } from '../utils/PerformanceMonitor'
import { Logger } from '../utils/Logger'
import type { SceneLight } from '../lighting/SceneLight'
import { UserPropPlacer } from './props/UserPropPlacer'

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

export interface EntranceMatOptions {
  width?: number
  depth?: number
}

//  TODO: Either StorePropsCoordinator needs to own this,
//  or, we need to do probably the proper thing
//  and have a single PropsManager (or whatever) class, and smaller specific classes for each prop type
//  right now this kinda sucks
export class PropRenderer {
  public static logger = Logger.createLogFunctions(PropRenderer.name)
  private scene: THREE.Scene
  private propsGroup: THREE.Group
  private lightFactory: LightFactory
  private currentFixturesGroup: THREE.Group | null = null


  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.propsGroup = new THREE.Group()
    this.propsGroup.name = 'AtmosphericProps'
    this.scene.add(this.propsGroup)
    this.lightFactory = new LightFactory(scene)
    new UserPropPlacer(scene)
  }

  /**
   * Create ceiling-mounted fluorescent light fixtures
   * Positioned just below the ceiling surface for realistic appearance
   * TODO: Make this responsive to room resizing events
   */
  public createCeilingLightFixtures(ceilingHeight: number, roomWidth: number, roomDepth: number, options: LightFixtureOptions = {}): readonly SceneLight[] {
    const monitor = PerformanceMonitor.start('create-ceiling-fixtures', PropRenderer.logger)
    
    const {
      width = 4,
      height = 0.15,
      depth = 0.6,
      emissiveIntensity = 1.0,
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
      emissive: 0xF0F8FF,
      emissiveIntensity,
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
    
    const totalFixtures = rows * fixturesPerRow

    // Create instanced meshes for housing and light panels (reduces draw calls!)
    const housingGeometry = new THREE.BoxGeometry(width + 0.1, height + 0.05, depth + 0.1)
    const housingInstanced = new THREE.InstancedMesh(housingGeometry, housingMaterial, totalFixtures)
    housingInstanced.name = 'CeilingFixtureHousings'
    
    const lightPanelInstanced = new THREE.InstancedMesh(fixtureGeometry, fixtureMaterial, totalFixtures)
    lightPanelInstanced.name = 'CeilingLightPanels'
    lightPanelInstanced.userData = { 
      isLightFixture: true,
      type: 'ceiling-fluorescent',
      instanceCount: totalFixtures
    }

    const matrix = new THREE.Matrix4()
    let instanceIndex = 0

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < fixturesPerRow; col++) {
        const fixtureX = -roomWidth / 2 + (col + 1) * fixtureSpacingX
        const fixtureZ = -roomDepth / 2 + (row + 1) * fixtureSpacingZ

        // Set housing instance matrix
        matrix.makeTranslation(fixtureX, fixtureY + 0.05, fixtureZ)
        housingInstanced.setMatrixAt(instanceIndex, matrix)

        // Set light panel instance matrix
        matrix.makeTranslation(fixtureX, fixtureY, fixtureZ)
        lightPanelInstanced.setMatrixAt(instanceIndex, matrix)

        instanceIndex++
      }
    }

    // Update instance matrices
    housingInstanced.instanceMatrix.needsUpdate = true
    lightPanelInstanced.instanceMatrix.needsUpdate = true

    fixturesGroup.add(housingInstanced)
    fixturesGroup.add(lightPanelInstanced)

    const sceneLights: SceneLight[] = []

    for (let row = 0; row < rows; row++) {
      const rowZ = -roomDepth / 2 + (row + 1) * fixtureSpacingZ

      const rowLight = this.lightFactory.createRectAreaLight(
        BlockbusterColors.fluorescentCool,
        6,
        roomWidth * 0.8,
        depth * 0.9,
        {
          name: `ceiling-row-${row}-light`,
          parent: fixturesGroup
        }
      )
      rowLight.position.set(0, fixtureY - 0.12, rowZ)
      rowLight.rotation.x = -Math.PI / 2
      rowLight.userData = {
        isShelfLight: true,
        rowIndex: row,
        fixtureCount: fixturesPerRow
      }
      sceneLights.push({ id: rowLight.id, emissiveMaterials: [fixtureMaterial], baseEmissiveIntensity: emissiveIntensity })
    }

    this.clearCeilingFixtures()
    this.currentFixturesGroup = fixturesGroup
    this.propsGroup.add(this.currentFixturesGroup)
    console.log(`💡 Created ${rows * fixturesPerRow} ceiling fixtures with ${rows} RectAreaLights at height ${fixtureY.toFixed(2)}m`)

    monitor.end({ totalFixtures: rows * fixturesPerRow, rectAreaLights: rows })
    return sceneLights
  }

  private clearCeilingFixtures(): void {
    if (this.currentFixturesGroup) {
      this.propsGroup.remove(this.currentFixturesGroup)
      this.currentFixturesGroup = null
    }
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

    posts.forEach((postPos, index) => {
      const post = new THREE.Mesh(postGeometry, wireMaterial)
      post.name = `wire-rack-post-${index}`
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
      leftWire.name = `wire-rack-wire-left-${i}`
      leftWire.rotation.x = Math.PI / 2
      leftWire.position.set(-width/2, shelfY, 0)
      rackGroup.add(leftWire)

      const rightWire = new THREE.Mesh(wireGeometry, wireMaterial)
      rightWire.name = `wire-rack-wire-right-${i}`
      rightWire.rotation.x = Math.PI / 2
      rightWire.position.set(width/2, shelfY, 0)
      rackGroup.add(rightWire)

      const sideWireGeometry = new THREE.CylinderGeometry(wireThickness/2, wireThickness/2, width)
      const backWire = new THREE.Mesh(sideWireGeometry, wireMaterial)
      backWire.name = `wire-rack-wire-back-${i}`
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
    post.name = 'category-divider-post'
    post.position.set(0, height / 2, 0)
    dividerGroup.add(post)

    // Small top cap
    const capGeometry = new THREE.BoxGeometry(0.1, 0.02, 0.1)
    const cap = new THREE.Mesh(capGeometry, postMaterial)
    cap.name = 'category-divider-cap'
    cap.position.set(0, height + 0.01, 0)
    dividerGroup.add(cap)

    dividerGroup.position.copy(position)
    dividerGroup.userData = { type: 'category-divider', isAtmosphericProp: true }
    
    this.propsGroup.add(dividerGroup)
    return dividerGroup
  }

  /**
   * Create entrance floor mat for visual entrance indication
   */
  public createEntranceFloorMat(roomWidth: number, roomDepth: number, options: EntranceMatOptions = {}): THREE.Group {
    const entranceGroup = new THREE.Group()
    entranceGroup.name = 'entrance-floor-mat'
    
    // Aisle runner: narrow along X, long along Z (PlaneGeometry(w,h) + rotation.x=-PI/2 maps w→X, h→Z)
    const matWidth = options.width ?? Math.min(3.2, roomWidth * 0.15)
    const matDepth = options.depth ?? Math.min(10, roomDepth * 0.7)
    const matGeometry = new THREE.PlaneGeometry(matWidth, matDepth)
    
    // Create mat material with different color/texture
    const matMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513, // Brown entrance mat
      roughness: 0.8,
      metalness: 0.1
    })
    
    const mat = new THREE.Mesh(matGeometry, matMaterial)
    mat.rotation.x = -Math.PI / 2
    mat.position.set(0, 0.01, 0) // Just above floor, no Z offset (positioned by caller)
    mat.name = 'entrance-mat'
    
    entranceGroup.add(mat)
    return entranceGroup
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
    centerLine.name = 'floor-marker-center'
    centerLine.rotation.x = -Math.PI / 2
    centerLine.position.set(0, 0.01, 0)
    markersGroup.add(centerLine)

    // Side aisle markers
    const leftLine = new THREE.Mesh(lineGeometry, lineMaterial)
    leftLine.name = 'floor-marker-left'
    leftLine.rotation.x = -Math.PI / 2
    leftLine.position.set(-roomWidth * 0.3, 0.01, 0)
    markersGroup.add(leftLine)

    const rightLine = new THREE.Mesh(lineGeometry, lineMaterial)
    rightLine.name = 'floor-marker-right'
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
    this.clearCeilingFixtures()
    this.clearProps()
    this.scene.remove(this.propsGroup)
  }
}
