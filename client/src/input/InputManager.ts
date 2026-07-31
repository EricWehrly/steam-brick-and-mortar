import * as THREE from 'three'
import { EventManager } from '../core/EventManager'
import { Logger } from '../utils/Logger'
import { InputAction } from './InputActions'
import { BindingResolver } from './BindingResolver'
import { DeviceDetector } from './DeviceDetector'
import { InputProfileStore } from './InputProfileStore'
import { CameraInputApplier } from './CameraInputApplier'
import type { InputCallbacks, InputState, MovementOptions } from './InputContracts'
import { InputActionResolver } from './InputActionResolver'
import { InputEventAdapter } from './InputEventAdapter'
import { InputProfileService } from './InputProfileService'
import { InputStateTracker } from './InputStateTracker'
import { InputEventTypes, type GamepadButtonPressedEvent } from '../types/InteractionEvents'

export type { InputCallbacks, InputState, MovementOptions } from './InputContracts'

export class InputManager {
    private static readonly logger = Logger.createLogFunctions(InputManager.name)
    private static activeInstance: InputManager | null = null

    private options: MovementOptions = {
        speed: 0.075,
        mouseSensitivity: 0.005,
        sprintMultiplier: 1.5
    }

    private isListeningToEvents = false
    private isPaused = false

    private readonly eventManager: EventManager
    private readonly stateTracker: InputStateTracker
    private readonly eventAdapter: InputEventAdapter
    readonly profileService: InputProfileService
    readonly actionResolver: InputActionResolver
    private readonly cameraInputApplier: CameraInputApplier

    constructor(options: Partial<MovementOptions> = {}, callbacks: InputCallbacks = {}) {
        this.options = { ...this.options, ...options }

        this.eventManager = EventManager.getInstance()
        const profileStore = new InputProfileStore()
        const bindingResolver = new BindingResolver()
        const deviceDetector = new DeviceDetector(this.eventManager)

        this.stateTracker = new InputStateTracker({
            ...callbacks,
            onRawKeyDown: code => this.actionResolver.handleRawKeyPress(code, this.profileService.getEnabledProfiles())
        })
        this.eventAdapter = new InputEventAdapter(this.stateTracker)
        this.profileService = new InputProfileService(this.eventManager, profileStore)
        this.actionResolver = new InputActionResolver(bindingResolver, deviceDetector, this.eventManager)
        this.cameraInputApplier = new CameraInputApplier()

        this.eventManager.registerEventHandler<GamepadButtonPressedEvent>(InputEventTypes.GamepadButtonPressed, this.handleGamepadButtonPressed)

        InputManager.activeInstance = this
    }

    static getActiveInstance(): InputManager | null {
        return InputManager.activeInstance
    }

    startListening(): void {
        if (this.isListeningToEvents) {
            InputManager.logger.warn('InputManager already listening to events')
            return
        }

        this.eventAdapter.startListening()
        this.actionResolver.start()
        this.isListeningToEvents = true

        InputManager.logger.debug('Input controls activated')
    }

    stopListening(): void {
        if (!this.isListeningToEvents) {
            return
        }

        this.eventAdapter.stopListening()
        this.actionResolver.stop()
        this.isListeningToEvents = false

        InputManager.logger.debug('Input controls deactivated')
    }

    /**
     * Suspends camera movement/rotation application (e.g. while the pause menu is open) without
     * tearing down DOM listeners or gamepad polling - action resolution (InputActionResolver)
     * keeps running every frame regardless, so global actions like OpenMenu can still be read
     * (needed to detect the press that closes the menu again). Distinct from
     * startListening()/stopListening(), which are real setup/teardown for dispose().
     */
    pause(): void {
        this.isPaused = true
    }

    resume(): void {
        this.isPaused = false
    }

    updateFrame(): void {
        this.actionResolver.updateFrame(
            this.profileService.getEnabledProfiles(),
            this.stateTracker.getKeysPressed(),
            this.stateTracker.getMouseButtonsPressed(),
            this.stateTracker.consumeMouseDeltaX(),
            this.stateTracker.consumeMouseDeltaY()
        )
    }

    updateCameraMovement(camera: THREE.Object3D): void {
        // updateFrame() always runs, paused or not - global actions (OpenMenu) still need to
        // resolve every frame so a press can be detected and close the menu again.
        this.updateFrame()

        if (this.isPaused) {
            return
        }

        this.cameraInputApplier.updateMovement(
            camera,
            this.actionResolver,
            this.options,
            this.isSprintActive()
        )
    }

    updateCameraRotation(camera: THREE.Object3D): void {
        if (this.isPaused) {
            return
        }

        this.cameraInputApplier.updateRotation(camera, this.actionResolver, this.options)
    }

    getInputState(): InputState {
        return this.stateTracker.getInputState()
    }

    setMovementOptions(options: Partial<MovementOptions>): void {
        this.options = { ...this.options, ...options }
    }

    isMoving(): boolean {
        return this.stateTracker.isMoving()
    }

    setXRSession(session: XRSession | null): void {
        this.actionResolver.setXRSession(session)
    }

    private isSprintActive(): boolean {
        if (this.actionResolver.isActionPressed(InputAction.Sprint)) {
            return true
        }

        return this.stateTracker.isShiftPressed()
    }

    private readonly handleGamepadButtonPressed = (event: CustomEvent<GamepadButtonPressedEvent>): void => {
        this.actionResolver.handleGamepadButtonPress(event.detail.buttonIndex, this.profileService.getEnabledProfiles())
    }

    dispose(): void {
        this.stopListening()
        this.stateTracker.clearCallbacks()
        this.stateTracker.clear()
        this.actionResolver.clear()
        this.actionResolver.dispose()
        this.eventManager.deregisterEventHandler(InputEventTypes.GamepadButtonPressed, this.handleGamepadButtonPressed)

        if (InputManager.activeInstance === this) {
            InputManager.activeInstance = null
        }
    }
}
