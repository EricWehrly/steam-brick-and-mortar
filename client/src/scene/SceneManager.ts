/**
 * Scene Manager - Three.js Scene Setup and Management
 * 
 * Handles:
 * - Scene initialization
 * - Lighting setup
 * - Camera management
 * - Render loop coordination
 */

import * as THREE from 'three'
// import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js' // For high graphics setting
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BlockbusterColors } from '../utils/Colors'
import { MaterialUtils } from '../utils/MaterialUtils'
import { TextureManager } from '../utils/TextureManager'

export interface SceneManagerOptions {
    antialias?: boolean
    enableShadows?: boolean
    shadowMapType?: THREE.ShadowMapType
    outputColorSpace?: THREE.ColorSpace
}

export class SceneManager {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private animationId: number | null = null
    private textureManager: TextureManager

    constructor(options: SceneManagerOptions = {}) {
        // Initialize RectAreaLight uniforms (required for RectAreaLight to work)
        RectAreaLightUniformsLib.init()
        
        // Initialize texture manager
        this.textureManager = TextureManager.getInstance()
        
        // Initialize Three.js components
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: options.antialias ?? true 
        })

        this.setupRenderer(options)
        this.setupScene()
        this.setupLighting()
        this.setupCamera()
        this.setupEventListeners()
    }

    private setupRenderer(options: SceneManagerOptions) {
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.outputColorSpace = options.outputColorSpace ?? THREE.SRGBColorSpace
        
        if (options.enableShadows ?? true) {
            this.renderer.shadowMap.enabled = true
            this.renderer.shadowMap.type = options.shadowMapType ?? THREE.PCFSoftShadowMap
        }
        
        // Enable WebXR
        this.renderer.xr.enabled = true
        
        document.body.appendChild(this.renderer.domElement)
    }

    private setupScene() {
        // Set Blockbuster mustard yellow background
        this.scene.background = new THREE.Color(BlockbusterColors.walls)
    }

    private setupLighting() {
        // Updated lighting for Blockbuster store atmosphere
        // Fluorescent-style lighting with cool white color temperature
        
        // Reduced ambient light to let emissive fixtures show through
        const ambientLight = new THREE.AmbientLight(BlockbusterColors.fluorescentCool, 0.1)
        this.scene.add(ambientLight)
        
        // Reduced directional light since we have point lights at fixtures
        const mainLight = new THREE.DirectionalLight(BlockbusterColors.fluorescentCool, 0.3)
        mainLight.position.set(0, 10, 0)
        mainLight.castShadow = true
        mainLight.shadow.mapSize.width = 1024
        mainLight.shadow.mapSize.height = 1024
        this.scene.add(mainLight)
        
        // Additional directional light for even coverage (retail store style)
        const fillLight = new THREE.DirectionalLight(BlockbusterColors.fluorescentWarm, 0.2)
        fillLight.position.set(5, 8, 5)
        this.scene.add(fillLight)
    }

    private setupCamera() {
        // Position camera at average human eye height
        this.camera.position.set(0, 1.6, 0)
    }

    private setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight
            this.camera.updateProjectionMatrix()
            this.renderer.setSize(window.innerWidth, window.innerHeight)
        })
    }

    /**
     * Start the render loop
     */
    public startRenderLoop(onBeforeRender?: () => void) {
        this.renderer.setAnimationLoop(() => {
            if (onBeforeRender) {
                onBeforeRender()
            }
            this.renderer.render(this.scene, this.camera)
        })
    }

    /**
     * Stop the render loop
     */
    public stopRenderLoop() {
        this.renderer.setAnimationLoop(null)
    }

    /**
     * Add an object to the scene
     */
    public addToScene(object: THREE.Object3D) {
        this.scene.add(object)
    }

    /**
     * Remove an object from the scene
     */
    public removeFromScene(object: THREE.Object3D) {
        this.scene.remove(object)
    }

    /**
     * Find objects in the scene by user data
     */
    public findObjectsByUserData(key: string, value?: unknown): THREE.Object3D[] {
        return this.scene.children.filter(child => {
            if (value !== undefined) {
                return child.userData?.[key] === value
            }
            return child.userData?.[key] !== undefined
        })
    }

    /**
     * Clear objects from scene by user data
     */
    public clearObjectsByUserData(key: string, value?: unknown) {
        const objects = this.findObjectsByUserData(key, value)
        objects.forEach(obj => this.scene.remove(obj))
        return objects.length
    }

    /**
     * Create a floor plane with procedural carpet texture
     */
    public createFloor(size: number = 20, _color: number = BlockbusterColors.floor, y: number = -2): THREE.Mesh {
        const floorGeometry = new THREE.PlaneGeometry(size, size)
        
        // Use procedural carpet material instead of basic material
        const floorMaterial = this.textureManager.createProceduralCarpetMaterial({
            repeat: { x: size / 4, y: size / 4 }, // Scale texture appropriately for room size
            color: '#8B0000', // Blockbuster red carpet
            roughness: 0.9,
            metalness: 0.0
        })
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = y
        floor.receiveShadow = true
        this.scene.add(floor)
        return floor
    }

    /**
     * Create a ceiling plane with procedural texture
     */
    public createCeiling(size: number = 20, y: number = 4): THREE.Mesh {
        const ceilingGeometry = new THREE.PlaneGeometry(size, size)
        
        // Use procedural ceiling material with popcorn texture
        const ceilingMaterial = this.textureManager.createProceduralCeilingMaterial({
            repeat: { x: size / 8, y: size / 8 }, // More repeats for ceiling texture detail
            color: '#F5F5DC', // Beige ceiling color
            bumpiness: 0.4,
            roughness: 0.7
        })
        
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        ceiling.rotation.x = Math.PI / 2 // Face down
        ceiling.position.y = y
        this.scene.add(ceiling)
        return ceiling
    }

    /**
     * Create visible fluorescent light fixtures
     * 
     * TODO: Make point lights optional via graphics settings - they impact performance
     * Consider adding a lightQuality setting: 'low' (no point lights), 'medium' (some lights), 'high' (all lights)
     */
    public createFluorescentFixtures(): THREE.Group {
        const fixturesGroup = new THREE.Group()
        
        // Create fixture geometry - rectangular tube
        const fixtureGeometry = new THREE.BoxGeometry(4, 0.2, 0.6)
        
        // Create glowing material for the fixtures
        const fixtureMaterial = new THREE.MeshStandardMaterial({
            color: 0xF5F5F5, // Off-white
            emissive: 0xE6F3FF, // Cool white glow
            emissiveIntensity: 0.6, // Increased from 0.3 to make them more visible
            roughness: 0.2,
            metalness: 0.1,
        })
        
        // Create multiple fixtures in a grid pattern
        const fixturePositions = [
            { x: -6, y: 3.5, z: -1 },
            { x: -2, y: 3.5, z: -1 },
            { x: 2, y: 3.5, z: -1 },
            { x: 6, y: 3.5, z: -1 },
            { x: -6, y: 3.5, z: 2 },
            { x: -2, y: 3.5, z: 2 },
            { x: 2, y: 3.5, z: 2 },
            { x: 6, y: 3.5, z: 2 },
        ]
        
        fixturePositions.forEach((pos, index) => {
            const fixture = new THREE.Mesh(fixtureGeometry, fixtureMaterial)
            fixture.position.set(pos.x, pos.y, pos.z)
            fixture.userData = { 
                isLightFixture: true,
                fixtureIndex: index 
            }
            fixturesGroup.add(fixture)
            
            // TODO: Individual RectAreaLight per fixture (for highest graphics setting)
            // const rectLight = new THREE.RectAreaLight(BlockbusterColors.fluorescentCool, 2, 3.8, 0.5)
            // rectLight.position.set(pos.x, pos.y - 0.1, pos.z) // Slightly below fixture
            // rectLight.lookAt(pos.x, pos.y - 2, pos.z) // Point downward
            // const helper = new RectAreaLightHelper(rectLight)
            // rectLight.add(helper)
            // fixturesGroup.add(rectLight)
        })
        
        // Performance optimization: Use only 2 RectAreaLights for the two rows
        // Front row of fixtures
        const frontRowLight = new THREE.RectAreaLight(BlockbusterColors.fluorescentCool, 3, 16, 0.5)
        frontRowLight.position.set(0, 3.4, -1) // Center of front row
        frontRowLight.lookAt(0, 1, -1) // Point downward
        fixturesGroup.add(frontRowLight)
        
        // Back row of fixtures  
        const backRowLight = new THREE.RectAreaLight(BlockbusterColors.fluorescentCool, 3, 16, 0.5)
        backRowLight.position.set(0, 3.4, 2) // Center of back row
        backRowLight.lookAt(0, 1, 2) // Point downward
        fixturesGroup.add(backRowLight)
        
        this.scene.add(fixturesGroup)
        console.log(`💡 Created ${fixturePositions.length} fluorescent fixtures`)
        
        return fixturesGroup
    }

    // Getters for accessing Three.js components
    public getScene(): THREE.Scene {
        return this.scene
    }

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer
    }

    /**
     * Cleanup resources
     */
    public dispose() {
        this.stopRenderLoop()
        this.renderer.dispose()
        document.body.removeChild(this.renderer.domElement)
    }
}
