/**
 * WebXR UI Coordinator - WebXR-specific UI management
 * 
 * This coordinator handles WebXR-related UI operations including:
 * - WebXR capabilities detection and display
 * - VR session state management
 * - WebXR-specific UI updates
 */

import { EventManager } from '../../core/EventManager'
import { WebXREventTypes } from '../../types/InteractionEvents'
import type { WebXRCapabilities } from '../../webxr/WebXRManager'
import type { UIManager } from '../UIManager'

export class WebXRUICoordinator {
    private eventManager: EventManager
    private uiManager?: UIManager

    constructor() {
        this.eventManager = EventManager.getInstance()
    }

    /**
     * Initialize with required dependencies
     */
    init(uiManager: UIManager): void {
        this.uiManager = uiManager
    }

    /**
     * Update WebXR support status in UI
     */
    updateWebXRSupport(capabilities: WebXRCapabilities): void {
        this.uiManager?.webxrUIPanel.setSupported(capabilities.supportsImmersiveVR)
    }

    /**
     * Update WebXR session state in UI
     */
    updateWebXRSessionState(isActive: boolean): void {
        this.uiManager?.webxrUIPanel.setSessionActive(isActive)
    }

    /**
     * Toggle VR session - complex operation using events
     */
    toggleVR(): void {
        this.eventManager.emit(WebXREventTypes.Toggle, {
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }
}