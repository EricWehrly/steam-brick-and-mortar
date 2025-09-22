/**
 * WebXR Event Handler
 * 
 * Handles all WebXR-related interaction workflows that were previously 
 * managed in SteamBrickAndMortarApp. This includes:
 * - WebXR session lifecycle management
 * - WebXR error handling
 * - WebXR capability updates
 * - Input pause/resume coordination
 * - Menu interaction coordination
 * 
 * Listens to interaction events and coordinates between WebXRCoordinator
 * and UICoordinator.
 */

import { EventManager } from '../core/EventManager'
import { WebXRCoordinator } from './WebXRCoordinator'
import { UICoordinator } from '../ui/UICoordinator'
import { Logger } from '../utils/Logger'
import { ToastManager } from '../ui/ToastManager'
import { WebXREventTypes, InputEventTypes, UIEventTypes } from '../types/InteractionEvents'
import type { WebXRCapabilities } from './WebXRManager'
import type {
    WebXRToggleEvent,
    WebXRSessionStartEvent,
    WebXRSessionEndEvent,
    WebXRErrorEvent,
    WebXRSupportChangeEvent,
    InputPauseEvent,
    InputResumeEvent,
    MenuOpenEvent,
    MenuCloseEvent
} from '../types/InteractionEvents'

export class WebXREventHandler {
    private static readonly logger = Logger.withContext(WebXREventHandler.name)
    private eventManager: EventManager
    private webxrCoordinator: WebXRCoordinator
    private uiCoordinator: UICoordinator
    private boundHandlers: Record<string, EventListener>

    constructor(
        webxrCoordinator: WebXRCoordinator,
        uiCoordinator: UICoordinator,
        eventManager?: EventManager
    ) {
        this.webxrCoordinator = webxrCoordinator
        this.uiCoordinator = uiCoordinator
        this.eventManager = eventManager || EventManager.getInstance()
        
        this.boundHandlers = {
            onWebXRToggle: this.onWebXRToggle.bind(this),
            onWebXRSessionStart: this.onWebXRSessionStart.bind(this),
            onWebXRSessionEnd: this.onWebXRSessionEnd.bind(this),
            onWebXRError: this.onWebXRError.bind(this),
            onWebXRSupportChange: this.onWebXRSupportChange.bind(this),
            onInputPause: this.onInputPause.bind(this),
            onInputResume: this.onInputResume.bind(this),
            onMenuOpen: this.onMenuOpen.bind(this),
            onMenuClose: this.onMenuClose.bind(this)
        }
        
        this.setupEventListeners()
        WebXREventHandler.logger.info('WebXREventHandler initialized')
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(WebXREventTypes.Toggle, this.boundHandlers.onWebXRToggle)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionStart, this.boundHandlers.onWebXRSessionStart)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionEnd, this.boundHandlers.onWebXRSessionEnd)
        this.eventManager.registerEventHandler(WebXREventTypes.Error, this.boundHandlers.onWebXRError)
        this.eventManager.registerEventHandler(WebXREventTypes.SupportChange, this.boundHandlers.onWebXRSupportChange)
        this.eventManager.registerEventHandler(InputEventTypes.Pause, this.boundHandlers.onInputPause)
        this.eventManager.registerEventHandler(InputEventTypes.Resume, this.boundHandlers.onInputResume)
        this.eventManager.registerEventHandler(UIEventTypes.MenuOpen, this.boundHandlers.onMenuOpen)
        this.eventManager.registerEventHandler(UIEventTypes.MenuClose, this.boundHandlers.onMenuClose)
    }

    private onWebXRToggle = (event: CustomEvent<WebXRToggleEvent>) => {
        this.handleWebXRToggle(event.detail)
    }

    private onWebXRSessionStart = (event: CustomEvent<WebXRSessionStartEvent>) => {
        this.handleWebXRSessionStart(event.detail)
    }

    private onWebXRSessionEnd = (event: CustomEvent<WebXRSessionEndEvent>) => {
        this.handleWebXRSessionEnd(event.detail)
    }

    private onWebXRError = (event: CustomEvent<WebXRErrorEvent>) => {
        this.handleWebXRError(event.detail)
    }

    private onWebXRSupportChange = (event: CustomEvent<WebXRSupportChangeEvent>) => {
        this.handleWebXRSupportChange(event.detail)
    }

    private onInputPause = (event: CustomEvent<InputPauseEvent>) => {
        this.handleInputPause(event.detail)
    }

    private onInputResume = (event: CustomEvent<InputResumeEvent>) => {
        this.handleInputResume(event.detail)
    }

    private onMenuOpen = (event: CustomEvent<MenuOpenEvent>) => {
        this.handleMenuOpen(event.detail)
    }

    private onMenuClose = (event: CustomEvent<MenuCloseEvent>) => {
        this.handleMenuClose(event.detail)
    }

    private async handleWebXRToggle(_event: WebXRToggleEvent): Promise<void> {
        WebXREventHandler.logger.info('Handling WebXR toggle request')
        await this.webxrCoordinator.handleWebXRToggle()
    }

    private handleWebXRSessionStart(_event: WebXRSessionStartEvent): void {
        WebXREventHandler.logger.info('WebXR session started')
        this.uiCoordinator.webxr.updateWebXRSessionState(true)
    }

    private handleWebXRSessionEnd(_event: WebXRSessionEndEvent): void {
        WebXREventHandler.logger.info('WebXR session ended')
        this.uiCoordinator.webxr.updateWebXRSessionState(false)
    }

    private handleWebXRError(event: WebXRErrorEvent): void {
        WebXREventHandler.logger.error('WebXR error occurred:', event.error)
        ToastManager.error('Failed to enter VR mode')
    }

    private handleWebXRSupportChange(event: WebXRSupportChangeEvent): void {
        WebXREventHandler.logger.info('WebXR capabilities changed:', event.capabilities)
        this.uiCoordinator.webxr.updateWebXRSupport(event.capabilities)
    }

    private handleInputPause(event: InputPauseEvent): void {
        WebXREventHandler.logger.debug(`Input paused: ${event.reason || 'unspecified'}`)
        this.webxrCoordinator.pauseInput()
    }

    private handleInputResume(event: InputResumeEvent): void {
        WebXREventHandler.logger.debug(`Input resumed: ${event.reason || 'unspecified'}`)
        this.webxrCoordinator.resumeInput()
    }

    private handleMenuOpen(event: MenuOpenEvent): void {
        WebXREventHandler.logger.debug(`Menu opened: ${event.menuType}`)
        // Pause input when any menu opens
        this.webxrCoordinator.pauseInput()
    }

    private handleMenuClose(event: MenuCloseEvent): void {
        WebXREventHandler.logger.debug(`Menu closed: ${event.menuType}`)
        // Resume input when menu closes
        this.webxrCoordinator.resumeInput()
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(WebXREventTypes.Toggle, this.boundHandlers.onWebXRToggle)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionStart, this.boundHandlers.onWebXRSessionStart)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SessionEnd, this.boundHandlers.onWebXRSessionEnd)
        this.eventManager.deregisterEventHandler(WebXREventTypes.Error, this.boundHandlers.onWebXRError)
        this.eventManager.deregisterEventHandler(WebXREventTypes.SupportChange, this.boundHandlers.onWebXRSupportChange)
        this.eventManager.deregisterEventHandler(InputEventTypes.Pause, this.boundHandlers.onInputPause)
        this.eventManager.deregisterEventHandler(InputEventTypes.Resume, this.boundHandlers.onInputResume)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuOpen, this.boundHandlers.onMenuOpen)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.boundHandlers.onMenuClose)
        
        WebXREventHandler.logger.info('WebXREventHandler disposed')
    }
}
