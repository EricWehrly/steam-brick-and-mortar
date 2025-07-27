/**
 * WebXR Manager
 * 
 * Manages WebXR session and capability detection:
 * - Detect WebXR support
 * - Handle VR session lifecycle
 * - Manage XR button states
 * - Session event handling
 */

import * as THREE from 'three'
import { Logger } from '../utils/Logger'
// Use global WebXR types from webxr.d.ts

export interface WebXRCapabilities {
    isSupported: boolean
    supportsImmersiveVR: boolean
    hasNavigatorXR: boolean
}

export interface WebXRSessionCallbacks {
    onSessionStart?: () => void
    onSessionEnd?: () => void
    onError?: (error: Error) => void
    onSupportChange?: (capabilities: WebXRCapabilities) => void
}

/**
 * Manages WebXR session lifecycle and capabilities
 */
export class WebXRManager {
    private static readonly logger = Logger.withContext(WebXRManager.name)
    private renderer: THREE.WebGLRenderer | null = null
    private currentSession: XRSession | null = null
    private capabilities: WebXRCapabilities = {
        isSupported: false,
        supportsImmersiveVR: false,
        hasNavigatorXR: false
    }
    private callbacks: WebXRSessionCallbacks = {}

    constructor(callbacks: WebXRSessionCallbacks = {}) {
        this.callbacks = callbacks
    }

    /**
     * Initialize WebXR manager with a Three.js renderer
     */
    setRenderer(renderer: THREE.WebGLRenderer): void {
        this.renderer = renderer
        
        // Enable XR on the renderer
        this.renderer.xr.enabled = true
    }

    /**
     * Check WebXR support and capabilities
     */
    async checkCapabilities(): Promise<WebXRCapabilities> {
        // Check if navigator.xr exists
        this.capabilities.hasNavigatorXR = !!navigator.xr
        
        if (!this.capabilities.hasNavigatorXR) {
            WebXRManager.logger.warn('WebXR not supported - falling back to desktop mode')
            this.capabilities.isSupported = false
            this.capabilities.supportsImmersiveVR = false
            this.callbacks.onSupportChange?.(this.capabilities)
            return this.capabilities
        }

        try {
            // Check if immersive VR sessions are supported
            this.capabilities.supportsImmersiveVR = await navigator.xr.isSessionSupported('immersive-vr')
            this.capabilities.isSupported = this.capabilities.supportsImmersiveVR

            if (this.capabilities.supportsImmersiveVR) {
                WebXRManager.logger.info('WebXR VR sessions supported')
            } else {
                WebXRManager.logger.warn('WebXR VR sessions not supported - desktop mode only')
            }
        } catch (error) {
            WebXRManager.logger.warn('WebXR session support check failed:', error)
            this.capabilities.isSupported = false
            this.capabilities.supportsImmersiveVR = false
        }

        this.callbacks.onSupportChange?.(this.capabilities)
        return this.capabilities
    }

    /**
     * Get current capabilities without re-checking
     */
    getCapabilities(): WebXRCapabilities {
        return { ...this.capabilities }
    }

    /**
     * Start an immersive VR session
     */
    async startVRSession(): Promise<void> {
        if (!this.renderer) {
            throw new Error('Renderer not set. Call setRenderer() first.')
        }

        if (!navigator.xr) {
            throw new Error('WebXR not available')
        }

        if (!this.capabilities.supportsImmersiveVR) {
            throw new Error('Immersive VR sessions not supported')
        }

        if (this.currentSession) {
            console.warn('⚠️ WebXR session already active')
            return
        }

        try {
            console.log('🥽 Attempting to start WebXR session...')
            
            const session = await navigator.xr.requestSession('immersive-vr')
            this.currentSession = session
            
            // Set the session on the renderer
            await this.renderer.xr.setSession(session)
            
            // Set up session event listeners
            session.addEventListener('end', () => {
                console.log('🚪 WebXR session ended')
                this.currentSession = null
                this.callbacks.onSessionEnd?.()
            })
            
            console.log('✅ WebXR session started!')
            this.callbacks.onSessionStart?.()
            
        } catch (error) {
            console.error('❌ Failed to start WebXR session:', error)
            this.callbacks.onError?.(error as Error)
            throw error
        }
    }

    /**
     * End the current VR session
     */
    async endVRSession(): Promise<void> {
        if (!this.currentSession) {
            console.warn('⚠️ No active WebXR session to end')
            return
        }

        try {
            await this.currentSession.end()
            // Session end event will be handled by the event listener
        } catch (error) {
            console.error('❌ Failed to end WebXR session:', error)
            this.callbacks.onError?.(error as Error)
            throw error
        }
    }

    /**
     * Check if a VR session is currently active
     */
    isSessionActive(): boolean {
        return this.currentSession !== null
    }

    /**
     * Get the current XR session (if any)
     */
    getCurrentSession(): XRSession | null {
        return this.currentSession
    }

    /**
     * Update callbacks
     */
    setCallbacks(callbacks: WebXRSessionCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks }
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.currentSession) {
            this.currentSession.end().catch(console.error)
        }
        this.currentSession = null
        this.callbacks = {}
    }
}
