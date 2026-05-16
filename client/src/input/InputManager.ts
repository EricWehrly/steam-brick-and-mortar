import * as THREE from 'three'
import { EventManager, EventSource } from '../core/EventManager'
import type { InputActionChangedEvent, InputProfileChangedEvent } from '../types/InteractionEvents'
import { InputEventTypes } from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'
import { InputAction } from './InputActions'
import { BindingResolver } from './BindingResolver'
import { DeviceDetector, type InputDeviceInfo } from './DeviceDetector'
import { InputProfileId, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from './InputProfile'
import type { InputActionId } from './InputActions'
import { InputProfileStore } from './InputProfileStore'

export interface InputState {
    keys: {
        w: boolean
        a: boolean
        s: boolean
        d: boolean
        q: boolean
        e: boolean
        space: boolean
        c: boolean
    }
    mouse: {
        down: boolean
        x: number
        y: number
    }
}

export interface MovementOptions {
    speed: number
    mouseSensitivity: number
    sprintMultiplier: number
}

export interface InputCallbacks {
    onMouseMove?: (deltaX: number, deltaY: number) => void
    onKeyPress?: (key: string) => void
    onKeyRelease?: (key: string) => void
}

export class InputManager {
    private static readonly logger = Logger.createLogFunctions(InputManager.name)
    private static activeInstance: InputManager | null = null

    private readonly eventManager: EventManager
    private readonly profileStore: InputProfileStore
    private readonly bindingResolver: BindingResolver
    private readonly deviceDetector: DeviceDetector

    private inputState: InputState = {
        keys: { w: false, a: false, s: false, d: false, q: false, e: false, space: false, c: false },
        mouse: { down: false, x: 0, y: 0 }
    }

    private keyPressTime: { [key: string]: number } = {}
    private readonly ACCELERATION_TIME = 2500
    private readonly MAX_SPEED_MULTIPLIER = 1.4

    private options: MovementOptions = {
        speed: 0.075,
        mouseSensitivity: 0.005,
        sprintMultiplier: 1.5
    }

    private callbacks: InputCallbacks = {}
    private isListeningToEvents = false
    private activeProfileId: InputProfileIdValue = InputProfileId.MouseKeyboard
    private actionAxes = new Map<string, number>()
    private actionButtons = new Map<string, boolean>()
    private previousActionButtons = new Map<string, boolean>()
    private keysPressed = new Set<string>()
    private mouseButtonsPressed = new Set<number>()
    private mouseDeltaX = 0
    private mouseDeltaY = 0
    private lastConnectedGamepads: ReadonlyArray<Gamepad> = []

    constructor(options: Partial<MovementOptions> = {}, callbacks: InputCallbacks = {}) {
        this.options = { ...this.options, ...options }
        this.callbacks = callbacks
        this.eventManager = EventManager.getInstance()
        this.profileStore = new InputProfileStore()
        this.bindingResolver = new BindingResolver()
        this.deviceDetector = new DeviceDetector(this.eventManager)
        this.activeProfileId = this.profileStore.getActiveProfileId()
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

        this.setupMouseControls()
        this.setupKeyboardControls()
        this.deviceDetector.start()
        this.isListeningToEvents = true

        InputManager.logger.debug('Input controls activated')
    }

    stopListening(): void {
        if (!this.isListeningToEvents) {
            return
        }

        this.removeEventListeners()
        this.deviceDetector.stop()
        this.isListeningToEvents = false

        InputManager.logger.debug('Input controls deactivated')
    }

    private setupMouseControls(): void {
        document.addEventListener('mousedown', this.handleMouseDown)
        document.addEventListener('mouseup', this.handleMouseUp)
        document.addEventListener('mousemove', this.handleMouseMove)
    }

    private setupKeyboardControls(): void {
        document.addEventListener('keydown', this.handleKeyDown)
        document.addEventListener('keyup', this.handleKeyUp)
    }

    private removeEventListeners(): void {
        document.removeEventListener('mousedown', this.handleMouseDown)
        document.removeEventListener('mouseup', this.handleMouseUp)
        document.removeEventListener('mousemove', this.handleMouseMove)
        document.removeEventListener('keydown', this.handleKeyDown)
        document.removeEventListener('keyup', this.handleKeyUp)
    }

    private handleMouseDown = (event: MouseEvent): void => {
        this.inputState.mouse.down = true
        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY
        this.mouseButtonsPressed.add(event.button)
    }

    private handleMouseUp = (event: MouseEvent): void => {
        this.inputState.mouse.down = false
        this.mouseButtonsPressed.delete(event.button)
    }

    private handleMouseMove = (event: MouseEvent): void => {
        const deltaX = event.clientX - this.inputState.mouse.x
        const deltaY = event.clientY - this.inputState.mouse.y

        this.inputState.mouse.x = event.clientX
        this.inputState.mouse.y = event.clientY

        if (!this.inputState.mouse.down) {
            return
        }

        this.mouseDeltaX += deltaX
        this.mouseDeltaY += deltaY
        this.callbacks.onMouseMove?.(deltaX, deltaY)
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        this.keysPressed.add(event.code)

        switch (event.code) {
            case 'KeyW':
                this.setKeyPressed('w')
                break
            case 'KeyA':
                this.setKeyPressed('a')
                break
            case 'KeyS':
                this.setKeyPressed('s')
                break
            case 'KeyD':
                this.setKeyPressed('d')
                break
            case 'KeyQ':
                this.setKeyPressed('q')
                break
            case 'KeyE':
                this.setKeyPressed('e')
                break
            case 'Space':
                this.setKeyPressed('space')
                break
            case 'KeyC':
                this.setKeyPressed('c')
                break
            default:
                break
        }
    }

    private handleKeyUp = (event: KeyboardEvent): void => {
        this.keysPressed.delete(event.code)

        switch (event.code) {
            case 'KeyW':
                this.setKeyReleased('w')
                break
            case 'KeyA':
                this.setKeyReleased('a')
                break
            case 'KeyS':
                this.setKeyReleased('s')
                break
            case 'KeyD':
                this.setKeyReleased('d')
                break
            case 'KeyQ':
                this.setKeyReleased('q')
                break
            case 'KeyE':
                this.setKeyReleased('e')
                break
            case 'Space':
                this.setKeyReleased('space')
                break
            case 'KeyC':
                this.setKeyReleased('c')
                break
            default:
                break
        }
    }

    private setKeyPressed(key: keyof InputState['keys']): void {
        if (!this.inputState.keys[key]) {
            this.inputState.keys[key] = true
            this.keyPressTime[key] = Date.now()
            this.callbacks.onKeyPress?.(key)
        }
    }

    private setKeyReleased(key: keyof InputState['keys']): void {
        this.inputState.keys[key] = false
        delete this.keyPressTime[key]
        this.callbacks.onKeyRelease?.(key)
    }

    private getProgressiveSpeed(key: string): number {
        const pressTime = this.keyPressTime[key]
        if (!pressTime) {
            return 0
        }

        const heldTime = Date.now() - pressTime
        const progress = Math.min(heldTime / this.ACCELERATION_TIME, 1)

        const minSpeed = this.options.speed * 0.1
        const maxSpeed = this.options.speed * this.MAX_SPEED_MULTIPLIER

        return minSpeed + (maxSpeed - minSpeed) * progress
    }

    updateFrame(): void {
        this.deviceDetector.pollGamepads()

        const gamepads = Array.from(navigator.getGamepads?.() ?? []).filter((gamepad): gamepad is Gamepad => Boolean(gamepad && gamepad.connected))
        this.lastConnectedGamepads = gamepads

        const enabledProfiles = this.getEnabledProfiles()
        const mergedAxes = new Map<string, number>()
        const mergedButtons = new Map<string, boolean>()

        for (const profile of enabledProfiles) {
            const resolved = this.bindingResolver.resolve(profile, {
                keysPressed: this.keysPressed,
                mouseButtonsPressed: this.mouseButtonsPressed,
                mouseDeltaX: this.mouseDeltaX,
                mouseDeltaY: this.mouseDeltaY,
                gamepads
            })

            for (const [actionId, value] of resolved.axes.entries()) {
                const existingValue = mergedAxes.get(actionId) ?? 0
                if (Math.abs(value) > Math.abs(existingValue)) {
                    mergedAxes.set(actionId, value)
                }
            }

            for (const [actionId, pressed] of resolved.buttons.entries()) {
                if (pressed) {
                    mergedButtons.set(actionId, true)
                } else if (!mergedButtons.has(actionId)) {
                    mergedButtons.set(actionId, false)
                }
            }
        }

        this.actionAxes = mergedAxes
        this.actionButtons = mergedButtons
        this.emitActionChanges()

        this.mouseDeltaX = 0
        this.mouseDeltaY = 0
    }

    updateCameraMovement(camera: THREE.Camera): void {
        this.updateFrame()

        const sprintMultiplier = this.isSprintActive() ? this.options.sprintMultiplier : 1

        if (this.inputState.keys.w) camera.translateZ(-(this.getProgressiveSpeed('w') * sprintMultiplier))
        if (this.inputState.keys.s) camera.translateZ(this.getProgressiveSpeed('s') * sprintMultiplier)
        if (this.inputState.keys.a) camera.translateX(-(this.getProgressiveSpeed('a') * sprintMultiplier))
        if (this.inputState.keys.d) camera.translateX(this.getProgressiveSpeed('d') * sprintMultiplier)
        if (this.inputState.keys.space) camera.translateY(this.getProgressiveSpeed('space') * sprintMultiplier)
        if (this.inputState.keys.c) camera.translateY(-(this.getProgressiveSpeed('c') * sprintMultiplier))

        const gamepadForward = this.getAxisValue(InputAction.MoveForward)
        const gamepadBack = this.getAxisValue(InputAction.MoveBack)
        const gamepadLeft = this.getAxisValue(InputAction.MoveLeft)
        const gamepadRight = this.getAxisValue(InputAction.MoveRight)
        const gamepadUp = this.getAxisValue(InputAction.MoveUp)
        const gamepadDown = this.getAxisValue(InputAction.MoveDown)

        if (gamepadForward > 0) camera.translateZ(-(this.options.speed * gamepadForward * sprintMultiplier))
        if (gamepadBack > 0) camera.translateZ(this.options.speed * gamepadBack * sprintMultiplier)
        if (gamepadLeft > 0) camera.translateX(-(this.options.speed * gamepadLeft * sprintMultiplier))
        if (gamepadRight > 0) camera.translateX(this.options.speed * gamepadRight * sprintMultiplier)
        if (gamepadUp > 0) camera.translateY(this.options.speed * gamepadUp * sprintMultiplier)
        if (gamepadDown > 0) camera.translateY(-(this.options.speed * gamepadDown * sprintMultiplier))
    }

    updateCameraRotation(camera: THREE.Camera, deltaX: number, _deltaY: number): void {
        camera.rotation.y -= deltaX * this.options.mouseSensitivity

        const gamepadLook = this.getAxisValue(InputAction.LookHorizontal)
        if (gamepadLook !== 0) {
            camera.rotation.y -= gamepadLook * this.options.mouseSensitivity * 2
        }
    }

    updateCameraRoll(_camera: THREE.Camera): void {
    }

    getInputState(): InputState {
        return { ...this.inputState }
    }

    setMovementOptions(options: Partial<MovementOptions>): void {
        this.options = { ...this.options, ...options }
    }

    setCallbacks(callbacks: InputCallbacks): void {
        this.callbacks = { ...this.callbacks, ...callbacks }
    }

    isMoving(): boolean {
        const { keys } = this.inputState
        return keys.w || keys.a || keys.s || keys.d || keys.q || keys.e
    }

    getAxisValue(actionId: string): number {
        return this.actionAxes.get(actionId) ?? 0
    }

    isActionPressed(actionId: string): boolean {
        return this.actionButtons.get(actionId) ?? false
    }

    getAvailableDevices(): ReadonlyArray<InputDeviceInfo> {
        return this.deviceDetector.getAvailableDevices()
    }

    getProfiles(): ReadonlyArray<InputProfileDefinition> {
        return this.profileStore.getProfiles()
    }

    getEnabledProfiles(): ReadonlyArray<InputProfileDefinition> {
        return this.profileStore.getProfiles().filter(profile => profile.enabled)
    }

    getActiveProfile(): InputProfileDefinition {
        return this.profileStore.getProfile(this.activeProfileId)
    }

    getActiveProfileId(): InputProfileIdValue {
        return this.activeProfileId
    }

    setActiveProfile(profileId: InputProfileIdValue): void {
        if (this.activeProfileId === profileId) {
            return
        }

        this.activeProfileId = profileId
        this.profileStore.setActiveProfileId(profileId)
        this.eventManager.emit<InputProfileChangedEvent>(
            InputEventTypes.ProfileChanged,
            { profileId },
            EventSource.UI
        )
    }

    setProfileEnabled(profileId: InputProfileIdValue, enabled: boolean): void {
        this.profileStore.setProfileEnabled(profileId, enabled)
        this.eventManager.emit<InputProfileChangedEvent>(
            InputEventTypes.ProfileChanged,
            { profileId: this.activeProfileId },
            EventSource.UI
        )
    }

    setXRSession(session: XRSession | null): void {
        this.deviceDetector.setXRSession(session)
    }

    setActionBinding(actionId: InputActionId, binding: InputBinding): void {
        this.profileStore.setActionBindings(this.activeProfileId, actionId, [binding])
        this.eventManager.emit<InputProfileChangedEvent>(
            InputEventTypes.ProfileChanged,
            { profileId: this.activeProfileId },
            EventSource.UI
        )
    }

    getConnectedGamepadAxisSnapshot(): ReadonlyArray<{ label: string; value: number }> {
        if (this.lastConnectedGamepads.length === 0) {
            return []
        }

        const gamepad = this.lastConnectedGamepads[0]
        return gamepad.axes.map((axisValue, axisIndex) => ({
            label: `Axis ${axisIndex}`,
            value: axisValue
        }))
    }

    private isSprintActive(): boolean {
        if (this.isActionPressed(InputAction.Sprint)) {
            return true
        }

        return this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight')
    }

    resetActiveProfileBindings(): void {
        this.profileStore.clearProfileOverrides(this.activeProfileId)
        this.eventManager.emit<InputProfileChangedEvent>(
            InputEventTypes.ProfileChanged,
            { profileId: this.activeProfileId },
            EventSource.UI
        )
    }

    private emitActionChanges(): void {
        for (const [actionId, isPressed] of this.actionButtons.entries()) {
            const previousPressed = this.previousActionButtons.get(actionId) ?? false
            if (previousPressed === isPressed) {
                continue
            }

            this.eventManager.emit<InputActionChangedEvent>(
                InputEventTypes.ActionChanged,
                {
                    actionId,
                    pressed: isPressed
                },
                EventSource.System
            )
            this.previousActionButtons.set(actionId, isPressed)
        }
    }

    dispose(): void {
        this.stopListening()
        this.callbacks = {}
        this.keysPressed.clear()
        this.mouseButtonsPressed.clear()
        this.actionAxes.clear()
        this.actionButtons.clear()
        this.previousActionButtons.clear()

        if (InputManager.activeInstance === this) {
            InputManager.activeInstance = null
        }
    }
}
