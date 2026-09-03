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
import {
    InputEventTypes, UIEventTypes,
    type GamepadButtonPressedEvent, type SprintTogglePressedEvent, type MenuOpenEvent, type MenuCloseEvent
} from '../types/InteractionEvents'

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
    // Any open menu (pause menu, a summoned game box, ...) blocks input the same way, regardless
    // of WHICH interface it is - PR review request, 2026-09-03: an input-adjacent class
    // (SceneClickGameBoxRaycast) was independently subscribing to UIEventTypes.MenuOpen/MenuClose
    // and keeping its own open-menu count just to gate its own clicks, which is exactly the kind
    // of "blocking specific inputs for specific interface conditions" this class should own
    // instead ("this should either be our UIManager or our InputManager... These Input classes
    // should be talking back to those"). Counted, not boolean: more than one modal surface can be
    // open at once (the pause menu and a game box, for instance), and this should only clear once
    // none are.
    private menuOpenCount = 0
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
        this.eventManager.registerEventHandler<MenuOpenEvent>(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.registerEventHandler<MenuCloseEvent>(UIEventTypes.MenuClose, this.handleMenuClose)

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

    /** Any menuType currently open (see UIEventTypes.MenuOpen/MenuClose) - the shared "is
     *  something modal up right now" check for input-adjacent classes that need to stand down
     *  while one is, instead of each independently tracking menu-open state itself. */
    isMenuOpen(): boolean {
        return this.menuOpenCount > 0
    }

    // Movement/rotation gating below checks both reasons together - explicit pause() (the pause
    // menu's own reason-based InputEventTypes.Pause/Resume, a binder overlay, ...) and any open
    // menuType. These used to reach the SAME effective gate (InputManager.pause()/resume()) two
    // different ways: explicitly via pauseInput()/resumeInput()'s relay, and separately via
    // WebXREventHandler independently listening for UIEventTypes.MenuOpen/MenuClose and calling
    // WebXRCoordinator.pauseInput()/resumeInput() (itself just this.pause()/resume()) on ANY
    // menuType, uncounted - which WebXREventHandler no longer needs to do now that this class
    // already tracks the same menuOpenCount itself (PR review request, 2026-09-03: "dedup
    // WebXREventHandler's pause on menu into InputManager's handling").
    private isInputBlocked(): boolean {
        return this.isPaused || this.isMenuOpen()
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

        if (this.isInputBlocked()) {
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
        if (this.isInputBlocked()) {
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

    private readonly handleMenuOpen = (): void => {
        this.menuOpenCount++
    }

    private readonly handleMenuClose = (): void => {
        this.menuOpenCount = Math.max(0, this.menuOpenCount - 1)
    }

    dispose(): void {
        this.stopListening()
        this.stateTracker.clearCallbacks()
        this.stateTracker.clear()
        this.actionResolver.clear()
        this.actionResolver.dispose()
        this.eventManager.deregisterEventHandler(InputEventTypes.GamepadButtonPressed, this.handleGamepadButtonPressed)
        this.eventManager.deregisterEventHandler(InputEventTypes.SprintTogglePressed, this.handleSprintTogglePressed)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.handleMenuClose)

        if (InputManager.activeInstance === this) {
            InputManager.activeInstance = null
        }
    }
}
