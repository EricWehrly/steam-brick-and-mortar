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
import { DataDomain, DataKey } from '../core/data/DataTypes'
import { RenderLoopRegistry } from './RenderLoopRegistry'
import { FrameBudgetScheduler } from '../utils/FrameBudgetScheduler'

export interface SceneManagerOptions {
    antialias?: boolean
    outputColorSpace?: THREE.ColorSpace
}

export class SceneManager {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private propRenderer: PropRenderer | null = null
    private skyboxManager: SkyboxManager
    private renderLoopRegistry: RenderLoopRegistry

    constructor(options: SceneManagerOptions = {}) {
        // Initialize RectAreaLight uniforms (required for RectAreaLight to work)
        RectAreaLightUniformsLib.init()
        
        // Initialize Three.js components
        this.scene = new THREE.Scene()
        
        DataManager.getInstance().set('core.mainScene', this.scene, {
            domain: DataDomain.Scene
        })
        
        // Camera Configuration
        // FOV (Field of View): Vertical angle in degrees
        //   - Narrow (45-60°): Telephoto effect, less distortion, focused view
        //   - Normal (60-75°): Standard perspective, natural look
        //   - Wide (75-90°): Wider view, more peripheral vision (better for VR)
        //   - Ultra-wide (90-120°): Fisheye effect, maximum awareness but distortion
        // Aspect Ratio: Width/height ratio (auto-calculated from window)
        // Near Clipping Plane: Closest visible distance (smaller = can see closer objects)
        //   - Too small (<0.01): Z-fighting and precision issues
        //   - Too large (>1): Nearby objects disappear
        // Far Clipping Plane: Furthest visible distance
        //   - Too small: Objects pop out of view too soon
        //   - Too large (>10000): Reduces depth buffer precision
        const CAMERA_FOV = 90;  // was 75 - wider FOV for VR comfort
        const CAMERA_ASPECT = window.innerWidth / window.innerHeight;
        const CAMERA_NEAR_DIST = 0.1;
        const CAMERA_FAR_DIST = 1000;
        this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, CAMERA_NEAR_DIST, CAMERA_FAR_DIST)
        
        // Store camera in DataManager for access by other systems (e.g., camera settings panel)
        DataManager.getInstance().set(DataKey.MainCamera, this.camera, {
            domain: DataDomain.Scene
        })
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: options.antialias ?? true 
        })

        DataManager.getInstance().set(DataKey.Renderer, this.renderer, {
            domain: DataDomain.Scene
        })

        // PropRenderer creation deferred to avoid blocking startup
        // Will be created on first use by LightingRenderer

        // Initialize skybox manager (retrieves scene from DataManager)
        this.skyboxManager = new SkyboxManager()
        
        // Initialize render loop registry
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

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

    public startRenderLoop() {
        let lastTime = performance.now()
        const scheduler = FrameBudgetScheduler.getInstance()
        
        this.renderer.setAnimationLoop(() => {
            const now = performance.now()
            const deltaTime = now - lastTime
            lastTime = now
            
            // Update frame budget scheduler (tracks frame times, processes pending tasks)
            scheduler.onFrameStart(now)
            
            // Execute all registered render loop callbacks
            this.renderLoopRegistry.executeAll(now, deltaTime)
            
            // Render the scene
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

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer
    }

    /**
     * Get PropRenderer (creates it if needed)
     */
    public getPropRenderer(): PropRenderer {
        if (!this.propRenderer) {
            this.propRenderer = new PropRenderer(this.scene)
        }
        return this.propRenderer
    }

    public dispose() {
        this.stopRenderLoop()
        this.skyboxManager.dispose()
        if (this.propRenderer) {
            this.propRenderer.dispose()
        }
        this.renderer.dispose()
        document.body.removeChild(this.renderer.domElement)
    }
}
