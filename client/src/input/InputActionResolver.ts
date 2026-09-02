import { EventManager, EventSource } from '../core/EventManager'
import { AppSettings } from '../core/AppSettings'
import { InputEventTypes, type InputDevicesChangedEvent, type CancelPressedEvent } from '../types/InteractionEvents'
import { InputAction } from './InputActions'
import { BindingResolver, type LookTuning } from './BindingResolver'
import { DeviceDetector, type InputDeviceInfo } from './DeviceDetector'
import type { InputProfileDefinition } from './InputProfile'

// The only button actions that need "trigger once per press" dispatch, mapped to the specific
// event each means - Sprint/RollLeft/RollRight/ResetCamera are deliberately absent, since those
// are correctly read continuously via isActionPressed() instead. SprintToggle DOES need this
// (unlike Sprint) - it's a discrete flip, not a hold.
const SPECIFIC_PRESS_EVENTS: Partial<Record<string, string>> = {
    [InputAction.OpenMenu]: InputEventTypes.OpenMenuPressed,
    [InputAction.Interact]: InputEventTypes.InteractPressed,
    [InputAction.Cancel]: InputEventTypes.CancelPressed,
    [InputAction.SprintToggle]: InputEventTypes.SprintTogglePressed
}

export interface InputActionSnapshot {
    axes: ReadonlyMap<string, number>
    buttons: ReadonlyMap<string, boolean>
}

export class InputActionResolver {
    private readonly bindingResolver: BindingResolver
    private readonly deviceDetector: DeviceDetector
    private readonly eventManager: EventManager
    private actionAxes = new Map<string, number>()
    private actionButtons = new Map<string, boolean>()
    private lastConnectedGamepads: ReadonlyArray<Gamepad> = []

    // Only changes when a device connects/disconnects - cached and refreshed on
    // InputEventTypes.DevicesChanged instead of rebuilt from scratch every updateFrame() call.
    private connectedProfileIds = new Set<string>()

    constructor(bindingResolver: BindingResolver, deviceDetector: DeviceDetector, eventManager: EventManager = EventManager.getInstance()) {
        this.bindingResolver = bindingResolver
        this.deviceDetector = deviceDetector
        this.eventManager = eventManager
        this.refreshConnectedProfileIds()
        this.eventManager.registerEventHandler<InputDevicesChangedEvent>(InputEventTypes.DevicesChanged, this.handleDevicesChanged)
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

    updateFrame(
        enabledProfiles: ReadonlyArray<InputProfileDefinition>,
        keysPressed: ReadonlySet<string>,
        mouseButtonsPressed: ReadonlySet<number>,
        mouseDeltaX = 0,
        mouseDeltaY = 0
    ): void {
        const gamepads = this.deviceDetector.pollGamepads()
        this.lastConnectedGamepads = gamepads
        const xrGamepads = this.deviceDetector.pollXRGamepads()

        const connectedProfiles = enabledProfiles.filter(profile => this.connectedProfileIds.has(profile.id))
        const lookTuning = this.readLookTuning()

        const mergedAxes = new Map<string, number>()
        const mergedButtons = new Map<string, boolean>()

        for (const profile of connectedProfiles) {
            const resolved = this.bindingResolver.resolve(profile, {
                keysPressed,
                mouseButtonsPressed,
                mouseDeltaX,
                mouseDeltaY,
                gamepads,
                xrGamepads,
                lookTuning
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

    /**
     * Resolves a single non-repeat keydown against connected+enabled profiles' keyboard-button
     * bindings. Mouse has no equivalent method - a real mouse click already has its own
     * independent dispatch (SystemUICoordinator), entirely separate from the binding system.
     */
    handleRawKeyPress(code: string, enabledProfiles: ReadonlyArray<InputProfileDefinition>): void {
        this.emitSpecificPressEvents(
            enabledProfiles,
            binding => binding.type === 'keyboard-button' && binding.code === code
        )
    }

    /**
     * Resolves a gamepad button transition (detected by DeviceDetector, which has no native press
     * event to rely on) against connected+enabled profiles' gamepad-button bindings. Covers both a
     * plain physical gamepad press (handedness omitted) and an XR controller press (handedness
     * given) - BindingResolver.matchesGamepadButtonPress is what keeps the two from crossing.
     */
    handleGamepadButtonPress(buttonIndex: number, enabledProfiles: ReadonlyArray<InputProfileDefinition>, handedness?: XRHandedness): void {
        this.emitSpecificPressEvents(
            enabledProfiles,
            binding => this.bindingResolver.matchesGamepadButtonPress(binding, buttonIndex, handedness)
        )
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

    dispose(): void {
        this.eventManager.deregisterEventHandler(InputEventTypes.DevicesChanged, this.handleDevicesChanged)
    }

    private emitSpecificPressEvents(
        enabledProfiles: ReadonlyArray<InputProfileDefinition>,
        matches: Parameters<BindingResolver['findButtonActionsBoundTo']>[1]
    ): void {
        const connectedProfiles = enabledProfiles.filter(profile => this.connectedProfileIds.has(profile.id))

        for (const profile of connectedProfiles) {
            const actionIds = this.bindingResolver.findButtonActionsBoundTo(profile, matches)
            // Escape/Start are bound to both OpenMenu and Cancel (see InputProfile.ts), so a
            // single press resolves both here - CancelPressedEvent.bundledWithOpenMenu records
            // that, so PauseMenuManager (whose own OpenMenuPressed handler already resolves
            // open/closed for this press) can tell it apart from a standalone Cancel, while every
            // other Cancel consumer keeps reacting the same either way - see that field's own doc
            // comment in InteractionEvents.ts.
            const bundledWithOpenMenu = actionIds.includes(InputAction.OpenMenu) && actionIds.includes(InputAction.Cancel)

            for (const actionId of actionIds) {
                const eventType = SPECIFIC_PRESS_EVENTS[actionId]
                if (!eventType) {
                    continue
                }
                if (actionId === InputAction.Cancel) {
                    this.eventManager.emit<CancelPressedEvent>(eventType, { bundledWithOpenMenu })
                } else {
                    this.eventManager.emit(eventType, {}, EventSource.System)
                }
            }
        }
    }

    private readonly handleDevicesChanged = (): void => {
        this.refreshConnectedProfileIds()
    }

    private readLookTuning(): LookTuning {
        return {
            mouse: {
                invert: AppSettings.get('inputLookInvertMouse'),
                sensitivity: AppSettings.get('inputLookSensitivityMouse')
            },
            gamepad: {
                invert: AppSettings.get('inputLookInvertGamepad'),
                sensitivity: AppSettings.get('inputLookSensitivityGamepad')
            }
        }
    }

    private refreshConnectedProfileIds(): void {
        this.connectedProfileIds = new Set(
            this.deviceDetector.getAvailableDevices()
                .filter(device => device.connected)
                .map(device => device.profileId)
        )
    }
}
