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
import { InputManager } from './InputManager'

export interface WebXRCoordinatorCallbacks {
    onSessionStart?: () => void
    onSessionEnd?: () => void
    onError?: (error: Error) => void
    onSupportChange?: (capabilities: WebXRCapabilities) => void
}

export interface WebXRCoordinatorConfig {
    input?: {
        speed?: number
        mouseSensitivity?: number
    }
}

/**
 * Coordinates all WebXR functionality including session management and input
 */
export class WebXRCoordinator {
    private webxrManager: WebXRManager
    private inputManager: InputManager
    private callbacks: WebXRCoordinatorCallbacks
    private pendingMouseDeltas: { deltaX: number, deltaY: number } | null = null

    constructor(config: WebXRCoordinatorConfig = {}, callbacks: WebXRCoordinatorCallbacks = {}) {
        this.callbacks = callbacks

        // Initialize WebXR manager with callbacks
        this.webxrManager = new WebXRManager({
            onSessionStart: () => this.handleSessionStart(),
            onSessionEnd: () => this.handleSessionEnd(),
            onError: (error: Error) => this.handleError(error),
            onSupportChange: (capabilities: WebXRCapabilities) => this.handleSupportChange(capabilities)
        })

        // Initialize input manager with mouse move callback
        this.inputManager = new InputManager(
            { 
                speed: config.input?.speed ?? 0.1, 
                mouseSensitivity: config.input?.mouseSensitivity ?? 0.005 
            },
            {
                onMouseMove: (deltaX: number, deltaY: number) => {
                    // We need the camera for mouse rotation, but we don't have it here
                    // Store the deltas and apply them in updateCameraMovement
                    this.pendingMouseDeltas = { deltaX, deltaY }
                }
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
        this.inputManager.updateCameraMovement(camera)
        
        // Handle Q/E roll rotation
        this.inputManager.updateCameraRoll(camera)
        
        // Handle pending mouse rotation (Y-axis only now)
        if (this.pendingMouseDeltas) {
            this.inputManager.updateCameraRotation(camera, this.pendingMouseDeltas.deltaX, this.pendingMouseDeltas.deltaY)
            this.pendingMouseDeltas = null // Clear after processing
        }
    }

    /**
     * Pause input handling (e.g., when pause menu is open)
     */
    pauseInput(): void {
        this.inputManager.stopListening()
    }

    /**
     * Resume input handling
     */
    resumeInput(): void {
        this.inputManager.startListening()
    }

    /**
     * Get the WebXR manager for advanced operations
     */
    getWebXRManager(): WebXRManager {
        return this.webxrManager
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.inputManager.dispose()
        this.webxrManager.dispose()
    }

    // Private event handlers

    private handleSessionStart(): void {
        console.log('✅ WebXR session started!')
        this.callbacks.onSessionStart?.()
    }

    private handleSessionEnd(): void {
        console.log('🚪 WebXR session ended')
        this.callbacks.onSessionEnd?.()
    }

    private handleError(error: Error): void {
        console.error('❌ WebXR error:', error)
        this.callbacks.onError?.(error)
    }

    private handleSupportChange(capabilities: WebXRCapabilities): void {
        this.callbacks.onSupportChange?.(capabilities)
    }
}
