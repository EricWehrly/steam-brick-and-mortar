import { EventManager, EventSource } from '../core/EventManager'
import type { InputDevicesChangedEvent, GamepadButtonPressedEvent } from '../types/InteractionEvents'
import { InputEventTypes } from '../types/InteractionEvents'
import { InputDeviceKind, type InputDeviceKindValue } from './InputProfile'
import { Logger } from '../utils/Logger'

export interface InputDeviceInfo {
    id: string
    name: string
    kind: InputDeviceKindValue
    connected: boolean
    profileId: string
}

export class DeviceDetector {
    private static readonly logger = Logger.createLogFunctions(DeviceDetector.name)

    private readonly eventManager: EventManager
    private devices = new Map<string, InputDeviceInfo>()
    private started = false
    private touchSeen = false
    private xrSession: XRSession | null = null
    private previousGamepadButtonsPressed = new Map<number, ReadonlyArray<boolean>>()

    constructor(eventManager: EventManager = EventManager.getInstance()) {
        this.eventManager = eventManager
        this.devices.set('mouse-keyboard', {
            id: 'mouse-keyboard',
            name: 'Mouse + Keyboard',
            kind: InputDeviceKind.MouseKeyboard,
            connected: true,
            profileId: 'mouse-keyboard'
        })
    }

    start(): void {
        if (this.started) {
            return
        }

        window.addEventListener('gamepadconnected', this.handleGamepadConnected)
        window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected)
        window.addEventListener('touchstart', this.handleTouchStart, { passive: true })
        this.started = true

        this.pollGamepads()
        this.emitDevicesChanged()
    }

    stop(): void {
        if (!this.started) {
            return
        }

        window.removeEventListener('gamepadconnected', this.handleGamepadConnected)
        window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected)
        window.removeEventListener('touchstart', this.handleTouchStart)
        this.detachXRSessionListeners(this.xrSession)
        this.xrSession = null
        this.started = false
    }

    setXRSession(session: XRSession | null): void {
        if (this.xrSession === session) {
            return
        }

        this.detachXRSessionListeners(this.xrSession)
        this.xrSession = session
        this.attachXRSessionListeners(this.xrSession)
        this.syncXRDevices()
        this.emitDevicesChanged()
    }

    pollGamepads(): void {
        const getGamepads = navigator.getGamepads?.bind(navigator)
        if (!getGamepads) {
            return
        }

        const gamepads = getGamepads()
        const connectedGamepadIds = new Set<string>()
        let changed = false

        for (const gamepad of gamepads) {
            if (!gamepad || !gamepad.connected) {
                continue
            }

            const deviceId = `gamepad-${gamepad.index}`
            connectedGamepadIds.add(deviceId)
            if (!this.devices.has(deviceId)) {
                changed = true
            }
            this.addGamepadDevice(gamepad)
        }

        for (const [deviceId, device] of this.devices.entries()) {
            if (device.kind === InputDeviceKind.Gamepad && !connectedGamepadIds.has(deviceId)) {
                this.devices.delete(deviceId)
                changed = true
            }
        }

        for (const gamepadIndex of this.previousGamepadButtonsPressed.keys()) {
            if (!connectedGamepadIds.has(`gamepad-${gamepadIndex}`)) {
                this.previousGamepadButtonsPressed.delete(gamepadIndex)
            }
        }

        // Emit DevicesChanged before button-press events - listeners that resolve raw gamepad
        // button presses (InputActionResolver) need this gamepad's profile to already be in
        // the connected set, or a press detected on the very same poll a gamepad first appears
        // would resolve against nothing.
        if (changed) {
            this.emitDevicesChanged()
        }

        for (const gamepad of gamepads) {
            if (gamepad && gamepad.connected) {
                this.emitNewlyPressedGamepadButtons(gamepad)
            }
        }
    }

    getAvailableDevices(): ReadonlyArray<InputDeviceInfo> {
        return Array.from(this.devices.values())
            .filter(device => device.connected)
            .sort((left, right) => left.name.localeCompare(right.name))
    }

    private emitNewlyPressedGamepadButtons(gamepad: Gamepad): void {
        const previousButtons = this.previousGamepadButtonsPressed.get(gamepad.index)

        gamepad.buttons.forEach((button, buttonIndex) => {
            const wasPressed = previousButtons?.[buttonIndex] ?? false
            if (button.pressed && !wasPressed) {
                this.eventManager.emit<GamepadButtonPressedEvent>(
                    InputEventTypes.GamepadButtonPressed,
                    { gamepadIndex: gamepad.index, buttonIndex },
                    EventSource.System
                )
            }
        })

        this.previousGamepadButtonsPressed.set(gamepad.index, gamepad.buttons.map(button => button.pressed))
    }

    private addGamepadDevice(gamepad: Gamepad): void {
        const deviceId = `gamepad-${gamepad.index}`
        this.devices.set(deviceId, {
            id: deviceId,
            name: gamepad.id || `Gamepad ${gamepad.index + 1}`,
            kind: InputDeviceKind.Gamepad,
            connected: true,
            profileId: 'gamepad-standard'
        })
    }

    private handleGamepadConnected = (event: GamepadEvent): void => {
        this.addGamepadDevice(event.gamepad)
        this.emitDevicesChanged()
    }

    private handleGamepadDisconnected = (event: GamepadEvent): void => {
        this.devices.delete(`gamepad-${event.gamepad.index}`)
        this.emitDevicesChanged()
    }

    private handleTouchStart = (): void => {
        if (this.touchSeen) {
            return
        }

        this.touchSeen = true
        this.devices.set('touch-primary', {
            id: 'touch-primary',
            name: 'Touch Screen',
            kind: InputDeviceKind.Touch,
            connected: true,
            profileId: 'touch'
        })
        this.emitDevicesChanged()
    }

    private attachXRSessionListeners(session: XRSession | null): void {
        session?.addEventListener('inputsourceschange', this.handleXRInputSourcesChange)
    }

    private detachXRSessionListeners(session: XRSession | null): void {
        session?.removeEventListener('inputsourceschange', this.handleXRInputSourcesChange)
    }

    private handleXRInputSourcesChange = (): void => {
        this.syncXRDevices()
        this.emitDevicesChanged()
    }

    private syncXRDevices(): void {
        for (const [deviceId, device] of this.devices.entries()) {
            if (device.kind === InputDeviceKind.VR) {
                this.devices.delete(deviceId)
            }
        }

        if (!this.xrSession) {
            return
        }

        let addedAny = false
        for (const inputSource of this.xrSession.inputSources) {
            const profileName = inputSource.profiles?.[0] ?? 'xr-controller'
            const handedness = inputSource.handedness || 'none'
            const id = `vr-${handedness}-${profileName}`
            this.devices.set(id, {
                id,
                name: `VR: ${profileName}`,
                kind: InputDeviceKind.VR,
                connected: true,
                profileId: 'vr'
            })
            addedAny = true
        }

        if (addedAny && !this.devices.has('vr-session')) {
            this.devices.set('vr-session', {
                id: 'vr-session',
                name: 'VR Session',
                kind: InputDeviceKind.VR,
                connected: true,
                profileId: 'vr'
            })
        }
    }

    private emitDevicesChanged(): void {
        const devices = this.getAvailableDevices()

        DeviceDetector.logger.info(
            `Connected input devices (${devices.length}):`,
            devices.map(device => `${device.name} [${device.kind}]`)
        )

        this.eventManager.emit<InputDevicesChangedEvent>(
            InputEventTypes.DevicesChanged,
            { devices },
            EventSource.System
        )
    }
}
