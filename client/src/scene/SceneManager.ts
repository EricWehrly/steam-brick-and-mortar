/**
 * Scene Coordinator - Complete 3D Scene Management and Coordination
 * 
 * This coordinator manages scene lifecycle and delegates
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
// TODO: don't pull directly from threejs examples. this will break.
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BlockbusterColors } from '../utils/Colors'
import { RenderPipelineManager } from './RenderPipelineManager'
import { RenderPipelineManagerDebug } from '../debug/RenderPipelineManagerDebug'
import { SkyboxManager, SkyboxPresets } from './SkyboxManager'
import { PropRenderer } from './PropRenderer'
import { DataManager } from '../core/data/DataManager'
import { DataDomain, DataKey } from '../core/data/DataTypes'
import { RenderLoopRegistry } from './RenderLoopRegistry'
import { FrameBudgetScheduler } from '../utils/FrameBudgetScheduler'
import { ThreeWebGLRendererDebug } from '../debug/ThreeWebGLRendererDebug'
import { EventManager } from '../core/EventManager'
import { AppSettings } from '../core/AppSettings'
import type { SettingChangedEvent } from '../core/AppSettings'
import { AppEventTypes, AppSettingsEventTypes } from '../types/InteractionEvents'
import type { VisibilityChangedEvent } from '../types/InteractionEvents'

export class SceneManager {
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    /**
     * The camera's parent - movement/rotation must be applied here, never to the camera
     * directly. Three.js's WebXRManager overwrites camera.position/quaternion from the headset
     * pose every frame once presenting (confirmed against three/src/renderers/webxr/
     * WebXRManager.js's updateUserCamera) when the camera has no parent, discarding any
     * translateX/Y/Z applied earlier that frame - this is why player movement felt like it had
     * no effect in VR. Parenting the camera under this rig and moving/rotating the rig instead
     * composes correctly with the headset pose in Three.js's own XR camera math (parent.matrixWorld
     * is what gets combined with the tracked pose), and is a no-op change in desktop mode (camera's
     * local transform under the rig stays identity, so world transform === rig transform, same as
     * moving the camera directly used to produce).
     *
     * camera.position/rotation are therefore always local-to-rig (effectively always identity) -
     * never read them expecting a world position; call camera.getWorldPosition()/getWorldDirection()
     * directly, or read this rig instead. Note for getWorldPosition()/getWorldDirection() callers
     * specifically: during an active XR session, camera.position/quaternion (and therefore
     * matrixWorld) only get resynced to the tracked headset pose inside renderer.render(), which
     * runs after every per-frame render-loop callback (see startRenderLoop() below) - so a callback
     * reading camera world position/direction sees the previous frame's pose, about one frame
     * stale. Reading this.cameraRig.position directly has no such lag, since movement writes to it
     * synchronously earlier the same frame. In practice this is imperceptible for anything that
     * doesn't need frame-perfect precision (LOD/culling thresholds, spotlight targeting) - noted
     * here so it isn't mistaken for a bug if ever noticed.
     */
    private cameraRig: THREE.Group
    private renderer: THREE.WebGLRenderer
    private renderPipelineManager: RenderPipelineManager
    private propRenderer: PropRenderer | null = null
    private skyboxManager: SkyboxManager
    private renderLoopRegistry: RenderLoopRegistry
    private envRenderTarget: THREE.WebGLRenderTarget | null = null

    constructor() {
        RectAreaLightUniformsLib.init()

        this.scene = new THREE.Scene()
        DataManager.getInstance().set('core.mainScene', this.scene, { domain: DataDomain.Scene })

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
        // 70 deg: good flatscreen default. VR headsets use 90-110 but that causes
        // fisheye edge distortion on a flat monitor. When WebXR is active, the
        // headset takes over projection entirely so this value only affects desktop view.
        const CAMERA_FOV = 70
        const CAMERA_ASPECT = window.innerWidth / window.innerHeight
        const CAMERA_NEAR_DIST = 0.1
        const CAMERA_FAR_DIST = 1000
        this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, CAMERA_NEAR_DIST, CAMERA_FAR_DIST)
        DataManager.getInstance().set(DataKey.MainCamera, this.camera, { domain: DataDomain.Scene })

        // See this.cameraRig's own doc comment for why the camera is parented here rather than
        // moved/rotated directly.
        this.cameraRig = new THREE.Group()
        this.cameraRig.name = 'camera-rig'
        this.cameraRig.add(this.camera)
        this.scene.add(this.cameraRig)
        DataManager.getInstance().set(DataKey.MainCameraRig, this.cameraRig, { domain: DataDomain.Scene })

        // Swap ThreeWebGLRendererDebug ↔ THREE.WebGLRenderer to toggle shader-compile
        // logging and slow-frame warnings. Both are identical at the type level.
        this.renderer = new ThreeWebGLRendererDebug({ antialias: AppSettings.get('antialias') })
        // this.renderer = new THREE.WebGLRenderer({ antialias: AppSettings.get('antialias') })
        DataManager.getInstance().set(DataKey.Renderer, this.renderer, { domain: DataDomain.Scene })

        this.skyboxManager = new SkyboxManager()
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.setupRenderer()
        this.setupEnvironmentLighting()
        this.setupCamera()
        // RenderPipelineManagerDebug self-gates on UrlUtils.isDiagnosticsEnabled() — safe to
        // always construct, matching ThreeWebGLRendererDebug/SceneManagerDebug's own pattern.
        this.renderPipelineManager = new RenderPipelineManagerDebug(this.renderer, this.scene, this.camera)
        this.setupEventListeners()
        this.initializeSkybox()

        EventManager.getInstance().registerEventHandler<VisibilityChangedEvent>(
            AppEventTypes.VisibilityChanged,
            this.handleVisibilityChanged.bind(this)
        )
    }

    private async initializeSkybox(): Promise<void> {
        try {
            await this.skyboxManager.applySkybox(SkyboxPresets.aurora)
        } catch (error) {
            console.error('Failed to apply skybox, using default:', error)
            // Ultimate fallback to current gold color if something goes wrong
            this.scene.background = new THREE.Color(BlockbusterColors.walls)
        }
    }

    private setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace
        // NoToneMapping: RenderPipelineManager owns tone mapping via ToneMappingEffect(AGX).
        // toneMappingExposure still works — AgXToneMapping() in the effect shader reads the uniform.
        this.renderer.toneMapping = THREE.NoToneMapping
        this.renderer.toneMappingExposure = AppSettings.get('toneMappingExposure')

        // Enable WebXR
        this.renderer.xr.enabled = true
        document.body.appendChild(this.renderer.domElement)
    }

    private setupEnvironmentLighting(): void {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer)
        this.envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment())
        this.scene.environment = this.envRenderTarget.texture
        this.scene.environmentIntensity = AppSettings.get('environmentIntensity')
        pmremGenerator.dispose()
    }

    private setupCamera() {
        // Sets the RIG's position, not the camera's - see this.cameraRig's doc comment.
        this.cameraRig.position.set(0, 1.6, 0)
    }

    private setupEventListeners() {
        this.renderer.xr.addEventListener('sessionstart', this.onXrSessionStart.bind(this))
        this.renderer.xr.addEventListener('sessionend', this.onXrSessionEnd.bind(this))

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight
            this.camera.updateProjectionMatrix()
            this.renderer.setSize(window.innerWidth, window.innerHeight)
            this.renderPipelineManager.setSize(window.innerWidth, window.innerHeight)
        })

        EventManager.getInstance().registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.onSettingChanged.bind(this)
        )
    }

    private onXrSessionStart(): void {
        this.renderer.toneMapping = THREE.AgXToneMapping
        // RenderPipelineManager's EffectComposer sets renderer.autoClear = false at construction
        // (postprocessing's EffectComposer.setRenderer() - it manages clearing itself, per-pass,
        // inside composer.render()). The XR render path in startRenderLoop() bypasses the composer
        // entirely and calls this.renderer.render() directly (XR takes over projection;
        // post-processing is skipped in VR), so with autoClear left false nothing ever clears the
        // color/depth buffer for the whole session - every frame's draws accumulate on top of
        // every previous frame's stale depth data. Root cause of the Edge/WebView2 "advancing
        // darkness" bug (progressive geometry dropout, absent in Chrome - the WebXR spec doesn't
        // mandate the browser implicitly clear the opaque XR framebuffer per frame, so Chrome's
        // compositor apparently masks this while Edge/WebView2's doesn't). Restored to false on
        // session end so the desktop path's composer-driven clearing keeps working correctly.
        this.renderer.autoClear = true
    }

    private onXrSessionEnd(): void {
        this.renderer.toneMapping = THREE.NoToneMapping
        this.renderer.autoClear = false
    }

    private onSettingChanged(event: CustomEvent<SettingChangedEvent>): void {
        if (event.detail.settingName === 'toneMappingExposure') {
            this.renderer.toneMappingExposure = event.detail.value as number
        }
        if (event.detail.settingName === 'environmentIntensity') {
            this.scene.environmentIntensity = event.detail.value as number
        }
    }

    private renderLoopCallback: (() => void) | null = null

    public startRenderLoop() {
        let lastTime = performance.now()
        const scheduler = FrameBudgetScheduler.getInstance()

        this.renderLoopCallback = () => {
            const now = performance.now()
            const deltaTime = now - lastTime
            lastTime = now
            
            // Update frame budget scheduler (tracks frame times, processes pending tasks)
            scheduler.onFrameStart(now)
            
            // Execute all registered render loop callbacks
            this.renderLoopRegistry.executeAll(now, deltaTime)

            // XR takes over projection entirely; post-processing pipeline bypassed in XR.
            if (this.renderer.xr.isPresenting) {
                this.renderer.render(this.scene, this.camera)
            } else {
                this.renderPipelineManager.render()
            }
            this.renderLoopRegistry.afterRender()
        }
        this.renderer.setAnimationLoop(this.renderLoopCallback)
    }

    private pauseRenderLoop(): void {
        this.renderer.setAnimationLoop(null)
    }

    private resumeRenderLoop(): void {
        if (this.renderLoopCallback) {
            this.renderer.setAnimationLoop(this.renderLoopCallback)
        }
    }

    private handleVisibilityChanged(event: CustomEvent<VisibilityChangedEvent>): void {
        if (event.detail.visible) {
            this.resumeRenderLoop()
        } else {
            this.pauseRenderLoop()
        }
    }

    public getScene(): THREE.Scene {
        return this.scene
    }

    public getCamera(): THREE.PerspectiveCamera {
        return this.camera
    }

    /** The camera's parent - see its own doc comment (on the private field) for why movement/
     *  rotation must be applied here instead of to the camera directly. */
    public getCameraRig(): THREE.Group {
        return this.cameraRig
    }

    public getRenderer(): THREE.WebGLRenderer {
        return this.renderer
    }

    public dispose() {
        this.renderer.setAnimationLoop(null)
        this.renderLoopCallback = null
        this.skyboxManager.dispose()
        this.propRenderer?.dispose()
        this.envRenderTarget?.dispose()
        this.scene.environment = null
        this.renderPipelineManager.dispose()
        this.renderer.dispose()
        document.body.removeChild(this.renderer.domElement)
    }
}
