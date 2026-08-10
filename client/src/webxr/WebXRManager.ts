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

/**
 * Preference order for `XRReferenceSpaceType`, most-capable first - 'local-floor' gives real
 * floor-relative tracking. A session must actually request 'local-floor'/'bounded-floor' as a
 * required/optional feature at requestSession() time (see startVRSession()) or
 * requestReferenceSpace() throws NotSupportedError for them regardless of whether the runtime
 * supports floor tracking - a PICO 4 bridged through PICO Connect/SteamVR was previously observed
 * falling all the way back to 'local' for exactly this reason (the feature was never requested),
 * not because the runtime lacks floor tracking. Even with the feature requested, a given runtime
 * may still not grant it, so this fallback probe stays as a safety net rather than assuming
 * success - letting the runtime's real capabilities drive this instead of us guessing.
 */
const REFERENCE_SPACE_FALLBACK_ORDER: ReadonlyArray<XRReferenceSpaceType> = ['local-floor', 'bounded-floor', 'local', 'viewer']

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
    private static readonly logger = Logger.createLogFunctions(WebXRManager.name)
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

            // requestReferenceSpace('local-floor'/'bounded-floor') throws NotSupportedError
            // unless that type was requested here at session-creation time, in requiredFeatures
            // or optionalFeatures - regardless of whether the runtime actually supports floor
            // tracking (confirmed against Three.js's own VRButton.js, which every official WebXR
            // example uses to start a session - it requests exactly these as optionalFeatures).
            // We were requesting neither, so determineSupportedReferenceSpaceType() below could
            // never succeed on anything but 'local' - not because this PICO 4/SteamVR runtime
            // lacks floor tracking, but because we never asked for it.
            //
            // requiredFeatures: ['local-floor'] - TEMP, diagnosing the Edge/WebView2 WebXR bug.
            // A-Frame's default session config (src/systems/webxr.js) requires 'local-floor'
            // rather than merely requesting it optionally; matching that exactly in case Edge's
            // session/feature negotiation path behaves differently for required vs. optional.
            // Low-confidence guess - revert if it doesn't change anything.
            const session = await navigator.xr.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['bounded-floor']
            })
            this.currentSession = session

            const referenceSpaceType = await this.determineSupportedReferenceSpaceType(session)
            WebXRManager.logger.info(`Using XR reference space: ${referenceSpaceType}`)
            this.renderer.xr.setReferenceSpaceType(referenceSpaceType)

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
     * Requesting a reference space is non-destructive and repeatable on the same session (per
     * the WebXR spec), so this probes REFERENCE_SPACE_FALLBACK_ORDER in order and returns the
     * first type the session actually grants, rather than assuming one always works. Three.js's
     * own `setSession()` would otherwise request its hardcoded default ('local-floor') once and
     * throw NotSupportedError with no fallback if the runtime doesn't support it.
     */
    private async determineSupportedReferenceSpaceType(session: XRSession): Promise<XRReferenceSpaceType> {
        for (const referenceSpaceType of REFERENCE_SPACE_FALLBACK_ORDER) {
            try {
                await session.requestReferenceSpace(referenceSpaceType)
                return referenceSpaceType
            } catch (error) {
                WebXRManager.logger.debug(`Reference space '${referenceSpaceType}' not supported, trying next fallback:`, error)
            }
        }
        throw new Error(`No supported XR reference space type found (tried: ${REFERENCE_SPACE_FALLBACK_ORDER.join(', ')})`)
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
