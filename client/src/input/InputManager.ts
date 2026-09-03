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
import { InputEventTypes, type GamepadButtonPressedEvent, type SprintTogglePressedEvent } from '../types/InteractionEvents'

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
    // Reason-agnostic: WHY input should be paused (the pause menu, a summoned game box, a binder
    // overlay, ...) is a UI-domain question this class deliberately stays ignorant of - whatever
    // decides that (SystemUICoordinator counts open menus; GameLibraryBinderUI has its own reason)
    // just tells this class via pause()/resume() or the InputEventTypes.Pause/Resume it's wired to
    // elsewhere. An input-consuming class asks isInputPaused() - one simple question - instead of
    // this class reaching into UI concepts (menuType, MenuOpen/MenuClose) to compute its own
    // answer (PR review request, 2026-09-03: "Doesn't this still 'dedup' to the existing path of
    // 'when an input happens, ask the input coordinator if it's in a state to want our events'?" -
    // a prior pass had this class listening to UIEventTypes.MenuOpen/MenuClose directly instead).
    private isPaused = false
    /** Flipped by SprintTogglePressed (currently only VR's left-thumbstick-click) - a discrete
     *  toggle, distinct from Sprint's hold-based keyboard Shift/gamepad stick-press. */
    private sprintToggled = false

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
        this.eventManager.registerEventHandler<SprintTogglePressedEvent>(InputEventTypes.SprintTogglePressed, this.handleSprintTogglePressed)

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

    /** The one question an input-consuming class (SceneClickGameBoxRaycast, camera movement/
     *  rotation below) needs answered - "should I act on input right now" - without needing to
     *  know WHY it might be paused. */
    isInputPaused(): boolean {
        return this.isPaused
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

    // stateTracker.isShiftPressed() used to be checked here too, but InputAction.Sprint's
    // MouseKeyboard binding already covers ShiftLeft/ShiftRight, and the mouse-keyboard device is
    // always registered as connected (DeviceDetector's constructor) - so isActionPressed(Sprint)
    // already reflects Shift on every frame that binding is resolved. The separate check was
    // strictly redundant, and worse, bypassed profile-enabled state entirely (Shift would still
    // trigger sprint even with the MouseKeyboard profile disabled in settings).
    private isSprintActive(): boolean {
        return this.actionResolver.isActionPressed(InputAction.Sprint) || this.sprintToggled
    }

    private readonly handleGamepadButtonPressed = (event: CustomEvent<GamepadButtonPressedEvent>): void => {
        this.actionResolver.handleGamepadButtonPress(event.detail.buttonIndex, this.profileService.getEnabledProfiles(), event.detail.handedness)
    }

    private readonly handleSprintTogglePressed = (): void => {
        this.sprintToggled = !this.sprintToggled
    }

    dispose(): void {
        this.stopListening()
        this.stateTracker.clearCallbacks()
        this.stateTracker.clear()
        this.actionResolver.clear()
        this.actionResolver.dispose()
        this.eventManager.deregisterEventHandler(InputEventTypes.GamepadButtonPressed, this.handleGamepadButtonPressed)
        this.eventManager.deregisterEventHandler(InputEventTypes.SprintTogglePressed, this.handleSprintTogglePressed)

        if (InputManager.activeInstance === this) {
            InputManager.activeInstance = null
        }
    }
}
