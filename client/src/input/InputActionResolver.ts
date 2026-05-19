import { BindingResolver } from './BindingResolver'
import { DeviceDetector, type InputDeviceInfo } from './DeviceDetector'
import type { InputProfileDefinition } from './InputProfile'

export interface InputActionSnapshot {
    axes: ReadonlyMap<string, number>
    buttons: ReadonlyMap<string, boolean>
}

export class InputActionResolver {
    private readonly bindingResolver: BindingResolver
    private readonly deviceDetector: DeviceDetector
    private actionAxes = new Map<string, number>()
    private actionButtons = new Map<string, boolean>()
    private lastConnectedGamepads: ReadonlyArray<Gamepad> = []

    constructor(bindingResolver: BindingResolver, deviceDetector: DeviceDetector) {
        this.bindingResolver = bindingResolver
        this.deviceDetector = deviceDetector
    }

    start(): void {
        this.deviceDetector.start()
    }

    stop(): void {
        this.deviceDetector.stop()
    }

    setXRSession(session: XRSession | null): void {
        this.deviceDetector.setXRSession(session)
    }

    updateFrame(enabledProfiles: ReadonlyArray<InputProfileDefinition>, keysPressed: ReadonlySet<string>, mouseButtonsPressed: ReadonlySet<number>): void {
        this.deviceDetector.pollGamepads()

        const gamepads = Array.from(navigator.getGamepads?.() ?? []).filter((gamepad): gamepad is Gamepad => Boolean(gamepad && gamepad.connected))
        this.lastConnectedGamepads = gamepads

        const connectedProfileIds = new Set(
            this.deviceDetector.getAvailableDevices()
                .filter(device => device.connected)
                .map(device => device.profileId)
        )

        const connectedProfiles = enabledProfiles.filter(profile => connectedProfileIds.has(profile.id))

        const mergedAxes = new Map<string, number>()
        const mergedButtons = new Map<string, boolean>()

        for (const profile of connectedProfiles) {
            const resolved = this.bindingResolver.resolve(profile, {
                keysPressed,
                mouseButtonsPressed,
                mouseDeltaX: 0,
                mouseDeltaY: 0,
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
    }

    getSnapshot(): InputActionSnapshot {
        return {
            axes: this.actionAxes,
            buttons: this.actionButtons
        }
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

    clear(): void {
        this.actionAxes.clear()
        this.actionButtons.clear()
    }
}
