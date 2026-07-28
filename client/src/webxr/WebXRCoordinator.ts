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
    camera: THREE.Camera
}

/**
 * Coordinates all WebXR functionality including session management and input
 */
export class WebXRCoordinator {
    private webxrManager: WebXRManager
    private inputManager: InputManager
    private eventManager: EventManager
    private renderLoopRegistry: RenderLoopRegistry
    private camera: THREE.Camera

    constructor(config: WebXRCoordinatorConfig) {
        this.camera = config.camera
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
        this.updateCameraMovement(this.camera)
    }

    /**
     * Handle WebXR toggle request from UI
     */
    async handleWebXRToggle(): Promise<void> {
        try {
            await this.webxrManager.startVRSession()
        } catch (error) {
            // Error handling is done in the WebXRManager callbacks
            console.debug('WebXR toggle failed:', error)
        }
    }

    /**
     * Update camera movement and rotation using input manager
     * Call this from the render loop
     */
    updateCameraMovement(camera: THREE.Camera): void {
        // Handle keyboard movement
        // we should ABSOLUTELY NOT update the camera in VR this way (from keybinds rather than headset data)
        this.inputManager.updateCameraMovement(camera)

        // Mouse-drag look is intentionally disabled; camera rotation now relies on other input paths.
        this.inputManager.updateCameraRotation(camera)
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
