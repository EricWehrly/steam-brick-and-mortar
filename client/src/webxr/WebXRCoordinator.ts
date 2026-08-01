/**
 * WebXR Coordinator - Complete WebXR Session and Input Coordination
 * 
 * This coordinator manages all WebXR functionality in one place:
 * - WebXR session lifecycle (start/end/error handling)
 * - Input management integration for VR controllers
 * - WebXR capability detection and support handling
 * - Renderer integration for WebXR functionality
 * 
 * The App should only need to call setupWebXR() and handleWebXRToggle()
 * to get full WebXR functionality without managing individual components.
 */

import * as THREE from 'three'
import { WebXRManager, type WebXRCapabilities } from './WebXRManager'
import { InputManager } from '../input/InputManager'
import { EventManager } from '../core/EventManager'
import { WebXREventTypes } from '../types/InteractionEvents'
import type { WebXRErrorEvent, WebXRSupportChangeEvent } from '../types/InteractionEvents'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import { AppSettings } from '../core/AppSettings'

export interface WebXRCoordinatorConfig {
    /**
     * The camera's parent rig, not the camera itself - see SceneManager's cameraRig doc comment
     * for why movement/rotation must be applied here instead of to the camera directly.
     */
    cameraRig: THREE.Object3D
}

/**
 * Coordinates all WebXR functionality including session management and input
 */
export class WebXRCoordinator {
    private webxrManager: WebXRManager
    private inputManager: InputManager
    private eventManager: EventManager
    private renderLoopRegistry: RenderLoopRegistry
    private cameraRig: THREE.Object3D

    constructor(config: WebXRCoordinatorConfig) {
        this.cameraRig = config.cameraRig
        this.eventManager = EventManager.getInstance()
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.webxrManager = new WebXRManager({
            onSessionStart: () => this.handleSessionStart(),
            onSessionEnd: () => this.handleSessionEnd(),
            onError: (error: Error) => this.handleError(error),
            onSupportChange: (capabilities: WebXRCapabilities) => this.handleSupportChange(capabilities)
        })

        // Initialize consolidated input manager.
        this.inputManager = new InputManager(
            {
                speed: AppSettings.get('inputSpeed'),
                mouseSensitivity: AppSettings.get('inputMouseSensitivity')
            }
        )
    }

    /**
     * Complete WebXR setup - call this once during app initialization
     */
    async setupWebXR(renderer: THREE.WebGLRenderer): Promise<void> {
        // Set the renderer for WebXR
        this.webxrManager.setRenderer(renderer)
        
        // Check WebXR capabilities
        await this.webxrManager.checkCapabilities()
        
        // Start input listening
        this.inputManager.startListening()
        
        // Register update method with render loop
        this.renderLoopRegistry.register(this.constructor.name, this.updateCamera.bind(this))
    }

    /**
     * Update camera movement - called every frame by render loop registry
     */
    private updateCamera(_now: number, _deltaTime: number): void {
        this.updateCameraMovement(this.cameraRig)
    }

    /**
     * Handle WebXR toggle request from UI
     */
    async handleWebXRToggle(): Promise<void> {
        try {
            if (this.webxrManager.isSessionActive()) {
                await this.webxrManager.endVRSession()
            } else {
                await this.webxrManager.startVRSession()
            }
        } catch (error) {
            // Error handling is done in the WebXRManager callbacks
            console.debug('WebXR toggle failed:', error)
        }
    }

    /**
     * Update camera movement and rotation using input manager. Call this from the render loop.
     *
     * Both apply to the camera's parent rig, never the camera itself (see SceneManager's
     * cameraRig doc comment for why - Three.js overwrites camera.position/quaternion from the
     * headset pose every XR frame for a parentless camera). Movement always runs, VR or desktop -
     * moving the rig composes correctly with the tracked headset pose in Three.js's own XR camera
     * math, so no session-active branch is needed here. Rotation is skipped entirely during an
     * active XR session: view rotation must come only from the headset, not mouse/keyboard input.
     */
    updateCameraMovement(cameraRig: THREE.Object3D): void {
        this.inputManager.updateCameraMovement(cameraRig)

        if (!this.webxrManager.isSessionActive()) {
            this.inputManager.updateCameraRotation(cameraRig)
        }
    }

    /**
     * Suspend camera movement/rotation (e.g., when pause menu is open). Uses pause()/resume()
     * rather than stopListening()/startListening() - those remain a real DOM-listener
     * teardown for setup/dispose, while pause() only gates camera application, keeping
     * InputActionResolver resolving every frame so global actions (e.g. OpenMenu) can still be
     * read to detect the press that closes the menu again.
     */
    pauseInput(): void {
        this.inputManager.pause()
    }

    /**
     * Resume camera movement/rotation
     */
    resumeInput(): void {
        this.inputManager.resume()
    }

    /**
     * Get the WebXR manager for advanced operations
     */
    getWebXRManager(): WebXRManager {
        return this.webxrManager
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)
        this.inputManager.dispose()
        this.webxrManager.dispose()
    }

    // Private event handlers

    private handleSessionStart(): void {
        console.log('✅ WebXR session started!')

        // The headset's tracked pose is a full absolute orientation (relative to the XR reference
        // space), not a delta - Three.js composes it with the rig's rotation every frame
        // (parent.matrixWorld in WebXRManager.updateCamera). Any residual rig rotation left over
        // from desktop mode (e.g. RoomManager's initial lookAt() aiming the flat camera at the
        // store) would silently add an unwanted rotation on top of the real headset orientation.
        // Desktop mode never hit this: a parentless camera had its rotation wholesale discarded
        // by the XR pose each frame, so a stale rotation never actually mattered until parenting
        // made it compose for real.
        this.cameraRig.quaternion.identity()

        // RoomManager's rig.position.y = 1.6 is a desktop-only stand-in for eye height - there's
        // no real head tracking in desktop mode to supply it. An earlier version of this fix only
        // zeroed Y for reference spaces officially documented as floor-anchored ('local-floor'/
        // 'bounded-floor'), on the assumption that 'local' reports a pose Y near 0 (anchored to
        // the viewer's own starting position, not the floor). Logged diagnostics
        // (SceneManager.logXRDiagnosticsIfDue) from a real PICO 4 / PICO Connect / SteamVR session
        // that negotiated 'local' falsified that assumption: the pose's local Y consistently
        // contributed ~1.1-1.2m on its own, landing the camera around 2.7-2.9m once stacked on top
        // of our own +1.6 - not colliding with the ceiling this time (ceilingHeight was raised to
        // rule that out), but still real height data we shouldn't be adding our own guess on top
        // of. SteamVR appears to report real height under 'local' in practice regardless of the
        // spec's generic description of that type. Zero unconditionally instead of trying to
        // infer from the reference-space label - X/Z are left alone, they represent real
        // horizontal room placement, which should carry over into VR same as desktop mode.
        this.cameraRig.position.y = 0

        this.inputManager.setXRSession(this.webxrManager.getCurrentSession())
        this.eventManager.emit(WebXREventTypes.SessionStart, {})
    }

    private handleSessionEnd(): void {
        console.log('🚪 WebXR session ended')
        this.inputManager.setXRSession(null)
        this.eventManager.emit(WebXREventTypes.SessionEnd, {})
    }

    private handleError(error: Error): void {
        console.error('❌ WebXR error:', error)
        this.eventManager.emit<WebXRErrorEvent>(WebXREventTypes.Error, { error })
    }

    private handleSupportChange(capabilities: WebXRCapabilities): void {
        this.eventManager.emit<WebXRSupportChangeEvent>(WebXREventTypes.SupportChange, { capabilities })
    }
}
