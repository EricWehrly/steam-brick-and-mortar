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

    private readonly stateTracker: InputStateTracker
    private readonly eventAdapter: InputEventAdapter
    readonly profileService: InputProfileService
    readonly actionResolver: InputActionResolver
    private readonly cameraInputApplier: CameraInputApplier

    constructor(options: Partial<MovementOptions> = {}, callbacks: InputCallbacks = {}) {
        this.options = { ...this.options, ...options }

        const eventManager = EventManager.getInstance()
        const profileStore = new InputProfileStore()
        const bindingResolver = new BindingResolver()
        const deviceDetector = new DeviceDetector(eventManager)

        this.stateTracker = new InputStateTracker(callbacks)
        this.eventAdapter = new InputEventAdapter(this.stateTracker)
        this.profileService = new InputProfileService(eventManager, profileStore)
        this.actionResolver = new InputActionResolver(bindingResolver, deviceDetector)
        this.cameraInputApplier = new CameraInputApplier()

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

    updateFrame(): void {
        this.actionResolver.updateFrame(
            this.profileService.getEnabledProfiles(),
            this.stateTracker.getKeysPressed(),
            this.stateTracker.getMouseButtonsPressed()
        )
    }

    updateCameraMovement(camera: THREE.Camera): void {
        this.updateFrame()

        this.cameraInputApplier.updateMovement(
            camera,
            this.actionResolver,
            this.options,
            this.isSprintActive()
        )
    }

    updateCameraRotation(camera: THREE.Camera, explicitDeltaX?: number): void {
        const deltaX = explicitDeltaX ?? this.stateTracker.consumeMouseDeltaX()
        this.cameraInputApplier.updateRotation(camera, this.actionResolver, this.options, deltaX)
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

    dispose(): void {
        this.stopListening()
        this.stateTracker.clearCallbacks()
        this.stateTracker.clear()
        this.actionResolver.clear()

        if (InputManager.activeInstance === this) {
            InputManager.activeInstance = null
        }
    }
}
