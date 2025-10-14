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
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BlockbusterColors } from '../utils/Colors'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { PropRenderer } from './PropRenderer'
import { DataManager } from '../core/data/DataManager'

export interface SceneManagerOptions {
    antialias?: boolean
    outputColorSpace?: THREE.ColorSpace
}

export class SceneManager {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private propRenderer: PropRenderer
    private skyboxManager: SkyboxManager

    constructor(options: SceneManagerOptions = {}) {
        // Initialize RectAreaLight uniforms (required for RectAreaLight to work)
        RectAreaLightUniformsLib.init()
        
        // Initialize Three.js components
        this.scene = new THREE.Scene()
        
        DataManager.getInstance().set('core.mainScene', this.scene, {
            domain: 'Scene' as any
        })
        
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: options.antialias ?? true 
        })

        // Initialize prop renderer for atmospheric elements
        this.propRenderer = new PropRenderer(this.scene)

        // Initialize skybox manager
        this.skyboxManager = new SkyboxManager(this.scene)

        this.setupRenderer(options)
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
        
        // Enable WebXR
        this.renderer.xr.enabled = true
        
        document.body.appendChild(this.renderer.domElement)
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
            
            this.renderer.render(this.scene, this.camera)
        })
    }

    public stopRenderLoop() {
        this.renderer.setAnimationLoop(null)
    }

    // Atmospheric Props Methods (Phase 2.4)

    // Getters for accessing Three.js components
    public getScene(): THREE.Scene {
        return this.scene
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer
    }

    public dispose() {
        this.stopRenderLoop()
        this.skyboxManager.dispose()
        this.propRenderer.dispose()
        this.renderer.dispose()
        document.body.removeChild(this.renderer.domElement)
    }
}
