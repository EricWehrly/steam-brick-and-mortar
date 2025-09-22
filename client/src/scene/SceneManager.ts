/**
 * Scene Coordinator - Complete 3D Scene Management and Coordination
 * 
 * This coordinator manag    private setupRenderer(options: SceneManagerOptions) { scene lifecycle and delegates
 * specific rendering tasks to specialized renderers:
 * - Three.js scene, camera, and renderer initialization
 * - Lighting and atmospheric setup
 * - Scene object management and coordination
 * - Render loop orchestration with performance monitoring
 * - Integration point for GameBoxRenderer, SignageRenderer, etc.
 * 
 * The App should only need to call high-level methods like setupScene()
 * and should not need direct access to individual renderers.
 */

import * as THREE from 'three'
// import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js' // For high graphics setting
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BlockbusterColors } from '../utils/Colors'
import { MaterialUtils } from '../utils/MaterialUtils'
import { TextureManager } from '../utils/TextureManager'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { PropRenderer } from './PropRenderer'

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
    private propRenderer: PropRenderer
    private skyboxManager: SkyboxManager

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

        // Initialize prop renderer for atmospheric elements
        this.propRenderer = new PropRenderer(this.scene)

        // Initialize skybox manager
        this.skyboxManager = new SkyboxManager(this.scene)

        this.setupRenderer(options)
        this.setupLighting()
        this.setupCamera()
        this.setupEventListeners()
        
        // Initialize skybox asynchronously (non-blocking)
        this.initializeSkybox()
    }

    /**
     * Initialize skybox asynchronously - called during construction
     */
    private async initializeSkybox(): Promise<void> {
        try {
            await this.skyboxManager.applySkybox(SkyboxPresets.aurora)
        } catch (error) {
            console.error('Failed to apply skybox, using default:', error)
            // Ultimate fallback to current gold color if something goes wrong
            this.scene.background = new THREE.Color(BlockbusterColors.walls)
        }
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
     * Start the render loop with integrated frame updates
     */
    public startRenderLoop(dependencies?: {
        webxrCoordinator?: any,
        sceneCoordinator?: any,
        systemUICoordinator?: any
    }) {
        let lastPerformanceUpdate = 0
        const performanceUpdateInterval = 1000 // Update performance data every second
        
        this.renderer.setAnimationLoop(() => {
            const now = Date.now()
            
            // Update camera movement via WebXR coordinator
            if (dependencies?.webxrCoordinator) {
                dependencies.webxrCoordinator.updateCameraMovement(this.camera)
            }
            
            // Update performance data periodically
            if (now - lastPerformanceUpdate > performanceUpdateInterval) {
                if (dependencies?.sceneCoordinator) {
                    dependencies.sceneCoordinator.updatePerformanceData(this.camera)
                }
                
                // Update UI performance monitor with Three.js renderer stats
                if (dependencies?.systemUICoordinator) {
                    dependencies.systemUICoordinator.updateRenderStats(this.renderer)
                }
                
                lastPerformanceUpdate = now
            }
            
            // Rotate the test cube
            const cube = this.scene.getObjectByName('cube') ?? this.scene.children.find(obj => obj instanceof THREE.Mesh)
            if (cube) {
                cube.rotation.x += 0.01
                cube.rotation.y += 0.01
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
     * Create fluorescent light fixtures using PropRenderer
     * Positioned just below the ceiling at the correct height
     */
    public createFluorescentFixtures(ceilingHeight: number = 3.2): THREE.Group {
        // Use PropRenderer to create proper ceiling-mounted fixtures
        return this.propRenderer.createCeilingLightFixtures(ceilingHeight, 22, 16, {
            width: 4,
            height: 0.15,
            depth: 0.6,
            emissiveIntensity: 0.8,
            rows: 2,
            fixturesPerRow: 4
        })
    }

    /**
     * Demonstration of enhanced procedural textures
     * Creates sample objects with the new texture system
     */
    public addEnhancedTextureDemo(): void {
        // Create floor with enhanced carpet texture
        const floorGeometry = new THREE.PlaneGeometry(20, 20)
        const carpetMaterial = this.textureManager.createEnhancedProceduralCarpetMaterial({
            color: '#8B0000',
            fiberDensity: 0.5,
            repeat: { x: 4, y: 4 }
        })
        const floor = new THREE.Mesh(floorGeometry, carpetMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.receiveShadow = true
        this.scene.add(floor)

        // Create ceiling with enhanced popcorn texture
        const ceilingGeometry = new THREE.PlaneGeometry(20, 20)
        const ceilingMaterial = this.textureManager.createEnhancedProceduralCeilingMaterial({
            color: '#F5F5DC',
            bumpSize: 0.6,
            density: 0.8,
            repeat: { x: 3, y: 3 }
        })
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        ceiling.rotation.x = Math.PI / 2
        ceiling.position.y = 8
        this.scene.add(ceiling)

        // Create wooden shelves with enhanced wood texture
        for (let i = 0; i < 3; i++) {
            const shelfGeometry = new THREE.BoxGeometry(6, 0.2, 1.5)
            const woodMaterial = this.textureManager.createEnhancedProceduralWoodMaterial({
                grainStrength: 0.5,
                ringFrequency: 0.1,
                color1: '#8B4513',
                color2: '#A0522D',
                color3: '#654321',
                repeat: { x: 3, y: 1 }
            })
            const shelf = new THREE.Mesh(shelfGeometry, woodMaterial)
            shelf.position.set(-5, 2 + i * 2, 0)
            shelf.castShadow = true
            this.scene.add(shelf)
        }

        // Create comparison objects with basic textures
        for (let i = 0; i < 3; i++) {
            const shelfGeometry = new THREE.BoxGeometry(6, 0.2, 1.5)
            const basicWoodMaterial = this.textureManager.createProceduralWoodMaterial({
                repeat: { x: 3, y: 1 }
            })
            const shelf = new THREE.Mesh(shelfGeometry, basicWoodMaterial)
            shelf.position.set(5, 2 + i * 2, 0)
            shelf.castShadow = true
            this.scene.add(shelf)
        }

        // Add labels to show the difference
        this.addTextLabel('Enhanced Textures', new THREE.Vector3(-5, 0.5, 2))
        this.addTextLabel('Basic Textures', new THREE.Vector3(5, 0.5, 2))
    }

    /**
     * Add a simple text label to the scene
     */
    private addTextLabel(text: string, position: THREE.Vector3): void {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return

        canvas.width = 512
        canvas.height = 128
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#000000'
        context.font = '48px Arial'
        context.textAlign = 'center'
        context.fillText(text, canvas.width / 2, canvas.height / 2 + 16)

        const texture = new THREE.CanvasTexture(canvas)
        const material = new THREE.MeshBasicMaterial({ 
            map: texture, 
            transparent: true 
        })
        const geometry = new THREE.PlaneGeometry(4, 1)
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(position)
        this.scene.add(mesh)
    }

    // Atmospheric Props Methods (Phase 2.4)

    /**
     * Create wire rack displays for snack/merchandise areas
     */
    public createWireRackDisplay(position: THREE.Vector3): THREE.Group {
        return this.propRenderer.createWireRackDisplay(position)
    }

    /**
     * Create category dividers between shelf sections
     */
    public createCategoryDivider(position: THREE.Vector3, height: number = 2.2): THREE.Group {
        return this.propRenderer.createCategoryDivider(position, height)
    }

    /**
     * Create subtle floor navigation markers
     */
    public createFloorMarkers(roomWidth: number = 22, roomDepth: number = 16): THREE.Group {
        return this.propRenderer.createFloorMarkers(roomWidth, roomDepth)
    }

    /**
     * Get the PropRenderer instance for advanced prop manipulation
     */
    public getPropRenderer(): PropRenderer {
        return this.propRenderer
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
        this.skyboxManager.dispose()
        this.propRenderer.dispose()
        this.renderer.dispose()
        document.body.removeChild(this.renderer.domElement)
    }
}
