import { getInputActionDefinition, InputAction, InputActionType, type InputActionId } from './InputActions'
import { InputDeviceKind, type AxisDirection, type InputBinding, type InputProfileDefinition, type InputProfileIdValue } from './InputProfile'

const GAMEPAD_CAPTURE_POLL_INTERVAL_MS = 50
const GAMEPAD_CAPTURE_THRESHOLD = 0.5

export interface InputBindingCaptureCallbacks {
    getActiveProfile: () => InputProfileDefinition | null
    onCaptured: (actionId: InputActionId, binding: InputBinding) => void
    onStatusUpdate: (message: string) => void
}

/**
 * "Press anything to bind this action" state machine, extracted out of ControlsPanel since it's
 * a self-contained capture flow (keyboard/mouse/gamepad) with no rendering concerns of its own -
 * it only ever talks back to its owner through callbacks.
 */
export class InputBindingCapture {
    private capturingActionId: InputActionId | null = null
    private capturingProfileId: InputProfileIdValue | null = null
    private gamepadPollTimer: number | null = null

    constructor(private readonly callbacks: InputBindingCaptureCallbacks) {}

    isCapturing(): boolean {
        return this.capturingActionId !== null
    }

    start(actionId: InputActionId): void {
        if (this.capturingActionId) {
            return
        }

        const activeProfile = this.callbacks.getActiveProfile()
        if (!activeProfile) {
            return
        }

        this.stopListeners()
        this.capturingActionId = actionId
        this.capturingProfileId = activeProfile.id
        const actionLabel = getInputActionDefinition(actionId).label

        if (activeProfile.deviceKind === InputDeviceKind.Gamepad) {
            this.callbacks.onStatusUpdate(`Move a stick or press a gamepad button for ${actionLabel}`)
            this.gamepadPollTimer = window.setInterval(() => this.pollGamepad(), GAMEPAD_CAPTURE_POLL_INTERVAL_MS)
            return
        }

        if (activeProfile.deviceKind === InputDeviceKind.MouseKeyboard) {
            this.callbacks.onStatusUpdate(`Press a key, click a mouse button, or move mouse axis for ${actionLabel}`)
            document.addEventListener('keydown', this.handleKeyDown, { once: true })
            document.addEventListener('mousedown', this.handleMouseDown, { once: true })
            document.addEventListener('mousemove', this.handleMouseMove)
            return
        }

        this.callbacks.onStatusUpdate(`Editing ${activeProfile.name} bindings is not supported yet`)
        this.capturingActionId = null
        this.capturingProfileId = null
    }

    /** Stops listening and discards any in-progress capture, without emitting a status message. */
    stop(): void {
        this.stopListeners()
        this.capturingActionId = null
        this.capturingProfileId = null
    }

    private cancel(): void {
        this.stop()
        this.callbacks.onStatusUpdate('Capture cancelled')
    }

    private finish(binding: InputBinding): void {
        const actionId = this.capturingActionId
        const captureProfileId = this.capturingProfileId
        this.stop()

        if (!actionId) {
            return
        }

        const activeProfile = this.callbacks.getActiveProfile()
        if (captureProfileId && activeProfile?.id !== captureProfileId) {
            this.callbacks.onStatusUpdate('Capture cancelled because active profile changed')
            return
        }

        this.callbacks.onCaptured(actionId, binding)
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        event.preventDefault()
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const direction = this.getButtonDirection(actionId)
        if (direction === null) {
            this.cancel()
            return
        }

        this.finish({
            type: 'keyboard-button',
            code: event.code,
            direction,
            label: event.code
        })
    }

    private readonly handleMouseDown = (event: MouseEvent): void => {
        event.preventDefault()
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const direction = this.getButtonDirection(actionId)
        if (direction === null) {
            this.cancel()
            return
        }

        this.finish({
            type: 'mouse-button',
            button: event.button,
            direction,
            label: event.button === 0 ? 'Left Click' : `Mouse ${event.button}`
        })
    }

    private readonly handleMouseMove = (event: MouseEvent): void => {
        const actionId = this.capturingActionId
        if (!actionId || !this.isAxisAction(actionId)) {
            return
        }

        if (Math.abs(event.movementX) < 3 && Math.abs(event.movementY) < 3) {
            return
        }

        const axis = Math.abs(event.movementX) >= Math.abs(event.movementY) ? 'x' : 'y'
        this.finish({
            type: 'mouse-axis',
            axis,
            sensitivity: 1,
            label: axis === 'x' ? 'Mouse X' : 'Mouse Y'
        })
    }

    private pollGamepad(): void {
        const actionId = this.capturingActionId
        if (!actionId) {
            return
        }

        const gamepads = Array.from(navigator.getGamepads?.() ?? []).filter((gamepad): gamepad is Gamepad => Boolean(gamepad && gamepad.connected))
        if (gamepads.length === 0) {
            return
        }

        if (this.isAxisAction(actionId)) {
            let strongestAxis: { index: number; value: number } | null = null
            for (const gamepad of gamepads) {
                gamepad.axes.forEach((axisValue, axisIndex) => {
                    if (Math.abs(axisValue) < GAMEPAD_CAPTURE_THRESHOLD) {
                        return
                    }

                    if (!strongestAxis || Math.abs(axisValue) > Math.abs(strongestAxis.value)) {
                        strongestAxis = { index: axisIndex, value: axisValue }
                    }
                })
            }

            if (strongestAxis) {
                const direction = this.getGamepadAxisDirection(actionId, strongestAxis.value)
                this.finish({
                    type: 'gamepad-axis',
                    axis: strongestAxis.index,
                    direction,
                    deadZone: 0.15,
                    label: `Gamepad Axis ${strongestAxis.index}`
                })
                return
            }
        }

        for (const gamepad of gamepads) {
            for (let buttonIndex = 0; buttonIndex < gamepad.buttons.length; buttonIndex += 1) {
                const button = gamepad.buttons[buttonIndex]
                if (!button || button.value < GAMEPAD_CAPTURE_THRESHOLD) {
                    continue
                }

                const direction = this.getButtonDirection(actionId)
                if (direction === null) {
                    this.cancel()
                    return
                }

                this.finish({
                    type: 'gamepad-button',
                    button: buttonIndex,
                    direction,
                    label: `Gamepad Button ${buttonIndex}`
                })
                return
            }
        }
    }

    private isAxisAction(actionId: InputActionId): boolean {
        return getInputActionDefinition(actionId).type === InputActionType.Axis
    }

    private getButtonDirection(actionId: InputActionId): AxisDirection | undefined | null {
        if (!this.isAxisAction(actionId)) {
            return undefined
        }

        if (actionId !== InputAction.LookHorizontal && actionId !== InputAction.LookVertical) {
            return 'positive'
        }

        const response = window.prompt(
            'Bind as + or - direction? Type + for increase (right/up), - for decrease (left/down).',
            '+'
        )

        if (response === null) {
            return null
        }

        return response.trim().startsWith('-') ? 'negative' : 'positive'
    }

    private getGamepadAxisDirection(actionId: InputActionId, axisValue: number): 'positive' | 'negative' | 'both' {
        if (actionId === InputAction.LookHorizontal || actionId === InputAction.LookVertical) {
            return 'both'
        }

        return axisValue >= 0 ? 'positive' : 'negative'
    }

    private stopListeners(): void {
        document.removeEventListener('keydown', this.handleKeyDown)
        document.removeEventListener('mousedown', this.handleMouseDown)
        document.removeEventListener('mousemove', this.handleMouseMove)

        if (this.gamepadPollTimer !== null) {
            window.clearInterval(this.gamepadPollTimer)
            this.gamepadPollTimer = null
        }
    }
}
