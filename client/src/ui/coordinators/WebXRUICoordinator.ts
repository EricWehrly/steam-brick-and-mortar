/**
 * WebXR UI Coordinator - WebXR-specific UI management
 * 
 * This coordinator handles WebXR-related UI operations including:
 * - WebXR capabilities detection and display
 * - VR session state management
 * - WebXR-specific UI updates
 */

import { EventManager, EventSource } from '../../core/EventManager'
import { WebXREventTypes } from '../../types/InteractionEvents'
import type { WebXRCapabilities } from '../../webxr/WebXRManager'
import { UIManager } from '../UIManager'

export class WebXRUICoordinator {
    private eventManager: EventManager

    constructor() {
        this.eventManager = EventManager.getInstance()
    }

    /**
     * Update WebXR support status in UI
     */
    updateWebXRSupport(capabilities: WebXRCapabilities): void {
        UIManager.getInstance().webxrUIPanel.setSupported(capabilities.supportsImmersiveVR)
    }

    /**
     * Update WebXR session state in UI
     */
    updateWebXRSessionState(isActive: boolean): void {
        UIManager.getInstance().webxrUIPanel.setSessionActive(isActive)
    }

    /**
     * Toggle VR session - complex operation using events
     */
    toggleVR(): void {
        this.eventManager.emit(WebXREventTypes.Toggle, {
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }
}