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
import { BlockbusterColors } from '../utils/Colors'
import { MaterialUtils } from '../utils/MaterialUtils'

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

    constructor(options: SceneManagerOptions = {}) {
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
        
        // Ambient light with fluorescent cool tone
        const ambientLight = new THREE.AmbientLight(BlockbusterColors.fluorescentCool, 0.4)
        this.scene.add(ambientLight)
        
        // Main overhead directional light (simulating fluorescent fixtures)
        const mainLight = new THREE.DirectionalLight(BlockbusterColors.fluorescentCool, 0.8)
        mainLight.position.set(0, 10, 0)
        mainLight.castShadow = true
        mainLight.shadow.mapSize.width = 1024
        mainLight.shadow.mapSize.height = 1024
        this.scene.add(mainLight)
        
        // Additional directional light for even coverage (retail store style)
        const fillLight = new THREE.DirectionalLight(BlockbusterColors.fluorescentWarm, 0.4)
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
     * Create a floor plane
     */
    public createFloor(size: number = 20, _color: number = BlockbusterColors.floor, y: number = -2): THREE.Mesh {
        const floorGeometry = new THREE.PlaneGeometry(size, size)
        const floorMaterial = MaterialUtils.createFloorMaterial()
        const floor = new THREE.Mesh(floorGeometry, floorMaterial)
        floor.rotation.x = -Math.PI / 2
        floor.position.y = y
        floor.receiveShadow = true
        this.scene.add(floor)
        return floor
    }

    /**
     * Create a ceiling plane
     */
    public createCeiling(size: number = 20, y: number = 4): THREE.Mesh {
        const ceilingGeometry = new THREE.PlaneGeometry(size, size)
        const ceilingMaterial = MaterialUtils.createCeilingMaterial()
        const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial)
        ceiling.rotation.x = Math.PI / 2 // Face down
        ceiling.position.y = y
        this.scene.add(ceiling)
        return ceiling
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
