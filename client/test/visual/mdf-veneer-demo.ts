/**
 * MDF Veneer Shelf Visual Demo - Task 6.1.1.1
 * Visual demonstration of realistic MDF veneer shelving with:
 * - Light oak veneer exterior surfaces
 * - Glossy white interior compartments
 * - Brand blue support posts
 */

import * as THREE from 'three'
import { ProceduralShelfGenerator } from '../../src/scene/ProceduralShelfGenerator'

/**
 * Create a demonstration scene showing MDF veneer shelves
 */
export function createMDFVeneerDemo(): void {
  console.log('🎨 Creating MDF Veneer Shelf Demo (Task 6.1.1.1)...')

  // Scene setup
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x222222)

  // Camera setup
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(3, 2, 3)
  camera.lookAt(0, 1, 0)

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.appendChild(renderer.domElement)

  // Lighting setup
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 5, 5)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  scene.add(directionalLight)

  // Create shelf generator
  const shelfGenerator = new ProceduralShelfGenerator(scene)

  // Create demonstration shelves with different configurations
  console.log('📦 Generating MDF veneer shelf units...')

  // Standard shelf unit
  const standardShelf = shelfGenerator.generateShelfUnit(
    new THREE.Vector3(-2, 0, 0),
    {
      width: 2.0,
      height: 2.0,
      depth: 0.4,
      shelfCount: 4,
      boardThickness: 0.05
    }
  )
  scene.add(standardShelf)

  // Taller shelf unit
  const tallShelf = shelfGenerator.generateShelfUnit(
    new THREE.Vector3(2, 0, 0),
    {
      width: 1.8,
      height: 2.5,
      depth: 0.5,
      shelfCount: 5,
      boardThickness: 0.05
    }
  )
  scene.add(tallShelf)

  // Wider shelf unit
  const wideShelf = shelfGenerator.generateShelfUnit(
    new THREE.Vector3(0, 0, -2),
    {
      width: 3.0,
      height: 1.8,
      depth: 0.4,
      shelfCount: 3,
      boardThickness: 0.05
    }
  )
  scene.add(wideShelf)

  // Add floor for reference
  const floorGeometry = new THREE.PlaneGeometry(10, 10)
  const floorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2F2F2F, // Dark carpet color
    roughness: 0.9
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.1
  floor.receiveShadow = true
  scene.add(floor)

  // Add orbit controls for interaction
  const controls = new (THREE as any).OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true

  // Add info panel
  const infoElement = document.createElement('div')
  infoElement.style.position = 'absolute'
  infoElement.style.top = '20px'
  infoElement.style.left = '20px'
  infoElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'
  infoElement.style.color = 'white'
  infoElement.style.padding = '15px'
  infoElement.style.borderRadius = '8px'
  infoElement.style.fontFamily = 'Arial, sans-serif'
  infoElement.style.fontSize = '14px'
  infoElement.style.lineHeight = '1.4'
  infoElement.innerHTML = `
    <h3 style="margin: 0 0 10px 0; color: #0066CC;">MDF Veneer Shelves - Task 6.1.1.1</h3>
    <div><strong>🎨 Materials:</strong></div>
    <div>• Light oak veneer exterior (#E6D3B7)</div>
    <div>• Glossy white interior surfaces (#FFFFF8)</div>
    <div>• Brand blue support posts (#0066CC)</div>
    <br>
    <div><strong>📐 Features:</strong></div>
    <div>• Realistic MDF construction</div>
    <div>• Semi-gloss veneer finish</div>
    <div>• Subtle wood grain textures</div>
    <div>• Separate interior compartments</div>
    <br>
    <div style="color: #888;">Drag to rotate • Scroll to zoom</div>
  `
  document.body.appendChild(infoElement)

  // Animation loop
  function animate() {
    requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  // Handle window resize
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onWindowResize)

  console.log('✅ MDF Veneer Demo initialized!')
  console.log('🔍 Material breakdown:')
  console.log('   • MDF Veneer: Light oak with subtle grain')
  console.log('   • Interior: High-gloss white compartments')
  console.log('   • Supports: Brand blue semi-gloss posts')
  
  animate()
}

// Auto-start demo if this file is loaded directly
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', createMDFVeneerDemo)
}