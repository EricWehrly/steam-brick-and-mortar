/**
 * WebXR Event Handler
 *
 * Handles all WebXR-related interaction workflows that were previously
 * managed in SteamBrickAndMortarApp. This includes:
 * - WebXR session lifecycle management
 * - WebXR error handling
 * - WebXR capability updates
 * - Input pause/resume coordination
 *
 * Listens to interaction events and coordinates between WebXRCoordinator
 * and UICoordinator.
 *
 * Used to also independently pause/resume on UIEventTypes.MenuOpen/MenuClose (uncounted - any
 * menu closing resumed input even with another still open). Removed once menu-open gating moved
 * to InputManager.isInputPaused(), which consumers now ask directly. Reason-based Pause/Resume
 * (the pause menu's own emission, a binder overlay) is unrelated and still handled below.
 */

import { EventManager } from '../core/EventManager'
import { WebXRCoordinator } from './WebXRCoordinator'
import { WebXRUICoordinator } from '../ui/coordinators'
import { Logger } from '../utils/Logger'
import { WebXREventTypes, InputEventTypes } from '../types/InteractionEvents'
import type {
    WebXRToggleEvent,
    WebXRSessionStartEvent,
    WebXRSessionEndEvent,
    WebXRErrorEvent,
    WebXRSupportChangeEvent,
    InputPauseEvent,
    InputResumeEvent
} from '../types/InteractionEvents'

export class WebXREventHandler {
    private static readonly logger = Logger.createLogFunctions(WebXREventHandler.name)
    private eventManager: EventManager
    private webxrCoordinator: WebXRCoordinator
    private webxrUICoordinator: WebXRUICoordinator
    private boundHandlers: Record<string, EventListener>

    constructor(
        webxrCoordinator: WebXRCoordinator,
        webxrUICoordinator: WebXRUICoordinator,
        eventManager?: EventManager
    ) {
        this.webxrCoordinator = webxrCoordinator
        this.webxrUICoordinator = webxrUICoordinator
        this.eventManager = eventManager || EventManager.getInstance()
        
        this.boundHandlers = {
            onWebXRToggle: this.onWebXRToggle.bind(this),
            onWebXRSessionStart: this.onWebXRSessionStart.bind(this),
            onWebXRSessionEnd: this.onWebXRSessionEnd.bind(this),
            onWebXRError: this.onWebXRError.bind(this),
            onWebXRSupportChange: this.onWebXRSupportChange.bind(this),
            onInputPause: this.onInputPause.bind(this),
            onInputResume: this.onInputResume.bind(this)
        }
        
        this.setupEventListeners()
        WebXREventHandler.logger.debug('WebXREventHandler initialized')
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(WebXREventTypes.Toggle, this.boundHandlers.onWebXRToggle)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionStart, this.boundHandlers.onWebXRSessionStart)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionEnd, this.boundHandlers.onWebXRSessionEnd)
        this.eventManager.registerEventHandler(WebXREventTypes.Error, this.boundHandlers.onWebXRError)
        this.eventManager.registerEventHandler(WebXREventTypes.SupportChange, this.boundHandlers.onWebXRSupportChange)
        this.eventManager.registerEventHandler(InputEventTypes.Pause, this.boundHandlers.onInputPause)
        this.eventManager.registerEventHandler(InputEventTypes.Resume, this.boundHandlers.onInputResume)
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

    private async handleWebXRToggle(_event: WebXRToggleEvent): Promise<void> {
        WebXREventHandler.logger.debug('Handling WebXR toggle request')
        await this.webxrCoordinator.handleWebXRToggle()
    }

    private handleWebXRSessionStart(_event: WebXRSessionStartEvent): void {
        WebXREventHandler.logger.debug('WebXR session started')
        this.webxrUICoordinator.updateWebXRSessionState(true)
    }

    private handleWebXRSessionEnd(_event: WebXRSessionEndEvent): void {
        WebXREventHandler.logger.debug('WebXR session ended')
        this.webxrUICoordinator.updateWebXRSessionState(false)
    }

    private handleWebXRError(event: WebXRErrorEvent): void {
        WebXREventHandler.logger.error('WebXR error occurred:', event.error)
    }

    private handleWebXRSupportChange(event: WebXRSupportChangeEvent): void {
        WebXREventHandler.logger.debug('WebXR capabilities changed:', event.capabilities)
        this.webxrUICoordinator.updateWebXRSupport(event.capabilities)
    }

    private handleInputPause(event: InputPauseEvent): void {
        WebXREventHandler.logger.debug(`Input paused: ${event.reason || 'unspecified'}`)
        this.webxrCoordinator.pauseInput()
    }

    private handleInputResume(event: InputResumeEvent): void {
        WebXREventHandler.logger.debug(`Input resumed: ${event.reason || 'unspecified'}`)
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

        WebXREventHandler.logger.debug('WebXREventHandler disposed')
    }
}
