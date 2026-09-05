import { invoke, isTauri } from '@tauri-apps/api/core'
import { EventManager, EventSource } from '../core/EventManager'
import type { InputDevicesChangedEvent, GamepadButtonPressedEvent } from '../types/InteractionEvents'
import { InputEventTypes } from '../types/InteractionEvents'
import { InputDeviceKind, type InputDeviceKindValue } from './InputProfile'
import type { XRGamepadState } from './BindingResolver'
import { Logger } from '../utils/Logger'

export interface InputDeviceInfo {
    id: string
    name: string
    kind: InputDeviceKindValue
    connected: boolean
    profileId: string
}

/** Mirrors desktop/tauri-app/src/hardware/hid_devices.rs::HidDeviceInfo. */
interface HidDeviceInfo {
    vendor_id: number
    product_id: number
    manufacturer: string | null
    product: string | null
    serial_number: string | null
    usage_page: number
    usage: number
    interface_number: number
}

export class DeviceDetector {
    private static readonly logger = Logger.createLogFunctions(DeviceDetector.name)

    private readonly eventManager: EventManager
    private devices = new Map<string, InputDeviceInfo>()
    private started = false
    private touchSeen = false
    private xrSession: XRSession | null = null
    private previousGamepadButtonsPressed = new Map<number, ReadonlyArray<boolean>>()
    private previousXRGamepadButtonsPressed = new Map<XRHandedness, ReadonlyArray<boolean>>()

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

        // Desktop-only, best-effort - see hardware/hid_devices.rs's doc comment for why this
        // exists: rich per-device data (vendor/product id, usage page/usage) that the browser's
        // own input APIs don't expose, useful for manually comparing how different physical
        // devices show up at the OS level. Fire-and-forget - a slow/failed probe shouldn't block
        // startup, matching this class's synchronous start() contract.
        void this.probeHidDevices()
    }

    /**
     * Logs the raw HID device enumeration (see hardware/hid_devices.rs's doc comment) for manual
     * inspection - diagnostic/enhancement only, not required for a working input stack.
     */
    private async probeHidDevices(): Promise<void> {
        if (!isTauri()) {
            return
        }

        try {
            const hidDevices = await invoke<HidDeviceInfo[]>('list_hid_devices')
            DeviceDetector.logger.info(`HID devices (${hidDevices.length}):`, hidDevices.map(device =>
                `vid=0x${device.vendor_id.toString(16).padStart(4, '0')} `
                + `pid=0x${device.product_id.toString(16).padStart(4, '0')} `
                + `usage_page=0x${device.usage_page.toString(16).padStart(2, '0')} `
                + `usage=0x${device.usage.toString(16).padStart(2, '0')} `
                + `iface=${device.interface_number} `
                + `manufacturer=${device.manufacturer ?? 'null'} product=${device.product ?? 'null'}`
            ))
        } catch (error) {
            DeviceDetector.logger.warn('Failed to enumerate HID devices:', error)
        }
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
        this.previousXRGamepadButtonsPressed.clear()
        this.started = false
    }

    setXRSession(session: XRSession | null): void {
        if (this.xrSession === session) {
            return
        }

        this.detachXRSessionListeners(this.xrSession)
        this.xrSession = session
        this.previousXRGamepadButtonsPressed.clear()
        this.attachXRSessionListeners(this.xrSession)
        this.syncXRDevices()
        this.emitDevicesChanged()
    }

    /**
     * Every connected XR controller's gamepad-shaped input, read live off the stored session's
     * inputSources - each real XRInputSource.gamepad is a standard Gamepad-API-shaped object
     * (buttons/axes), no XRFrame needed. Empty when no session is active or no controller has a
     * gamepad (e.g. hand tracking with no physical controller).
     */
    getXRGamepads(): ReadonlyArray<XRGamepadState> {
        // inputSources is an external WebXR API boundary - observed on this Tauri/WebView2 target
        // to transiently report as undefined (throwing "not iterable") while xrSession itself is
        // still non-null, e.g. during session teardown churn. Treat as no controllers rather than
        // crashing this frame's poll.
        if (!this.xrSession?.inputSources) {
            return []
        }

        const result: XRGamepadState[] = []
        for (const inputSource of this.xrSession.inputSources) {
            if (inputSource.gamepad) {
                result.push({ handedness: inputSource.handedness, gamepad: inputSource.gamepad })
            }
        }
        return result
    }

    /**
     * Same role as pollGamepads() for standard gamepads: returns the live XR gamepad list (so
     * InputActionResolver.updateFrame doesn't re-read session.inputSources itself) and emits
     * GamepadButtonPressedEvent (handedness set, gamepadIndex absent) on a released-to-pressed
     * transition. Keyed by handedness, not array index - three.js/WebXR don't guarantee a stable
     * controller-to-index mapping.
     */
    pollXRGamepads(): ReadonlyArray<XRGamepadState> {
        const xrGamepads = this.getXRGamepads()
        const connectedHandedness = new Set(xrGamepads.map(({ handedness }) => handedness))

        for (const handedness of this.previousXRGamepadButtonsPressed.keys()) {
            if (!connectedHandedness.has(handedness)) {
                this.previousXRGamepadButtonsPressed.delete(handedness)
            }
        }

        for (const xrGamepad of xrGamepads) {
            this.emitNewlyPressedXRGamepadButtons(xrGamepad)
        }

        return xrGamepads
    }

    /**
     * Returns the connected gamepads polled this call, so callers needing the same data
     * (InputActionResolver.updateFrame's continuous axis/button resolution) don't issue their
     * own separate navigator.getGamepads() call - that API is only meant to be read once per frame.
     */
    pollGamepads(): ReadonlyArray<Gamepad> {
        const getGamepads = navigator.getGamepads?.bind(navigator)
        if (!getGamepads) {
            return []
        }

        const gamepads = getGamepads()
        const connectedGamepads: Gamepad[] = []
        const connectedGamepadIds = new Set<string>()
        let changed = false

        for (const gamepad of gamepads) {
            if (!gamepad || !gamepad.connected) {
                continue
            }

            connectedGamepads.push(gamepad)
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

        for (const gamepad of connectedGamepads) {
            this.emitNewlyPressedGamepadButtons(gamepad)
        }

        return connectedGamepads
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

    private emitNewlyPressedXRGamepadButtons({ handedness, gamepad }: XRGamepadState): void {
        const previousButtons = this.previousXRGamepadButtonsPressed.get(handedness)

        gamepad.buttons.forEach((button, buttonIndex) => {
            const wasPressed = previousButtons?.[buttonIndex] ?? false
            if (button.pressed && !wasPressed) {
                // Real button-index ground truth on every press - reach for
                // `setLogLevel('DeviceDetector', 'DEBUG')` if verifying hardware mapping again.
                DeviceDetector.logger.debug(
                    `XR button pressed [${handedness}]: buttonIndex=${buttonIndex} value=${button.value.toFixed(2)} `
                    + `axes=[${gamepad.axes.map(axis => axis.toFixed(2)).join(', ')}]`
                )
                this.eventManager.emit<GamepadButtonPressedEvent>(
                    InputEventTypes.GamepadButtonPressed,
                    { handedness, buttonIndex },
                    EventSource.System
                )
            }
        })

        this.previousXRGamepadButtonsPressed.set(handedness, gamepad.buttons.map(button => button.pressed))
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

        // See getXRGamepads()'s doc comment - same external-API-boundary guard.
        if (!this.xrSession?.inputSources) {
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
