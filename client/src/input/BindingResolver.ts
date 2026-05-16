import {
    InputAction,
    INPUT_ACTION_DEFINITIONS,
    InputActionType,
    type InputActionId
} from './InputActions'
import type {
    GamepadAxisBinding,
    GamepadButtonBinding,
    InputBinding,
    InputProfileDefinition,
    MouseAxisBinding
} from './InputProfile'

export interface RawInputState {
    keysPressed: ReadonlySet<string>
    mouseButtonsPressed: ReadonlySet<number>
    mouseDeltaX: number
    mouseDeltaY: number
    gamepads: ReadonlyArray<Gamepad>
}

export interface ResolvedActionState {
    axes: ReadonlyMap<InputActionId, number>
    buttons: ReadonlyMap<InputActionId, boolean>
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function normalizeGamepadAxis(rawValue: number, deadZone: number): number {
    if (Math.abs(rawValue) <= deadZone) {
        return 0
    }

    const sign = Math.sign(rawValue)
    const normalizedMagnitude = (Math.abs(rawValue) - deadZone) / (1 - deadZone)
    return sign * clamp(normalizedMagnitude, 0, 1)
}

function resolveGamepadAxisValue(binding: GamepadAxisBinding, gamepads: ReadonlyArray<Gamepad>): number {
    let bestValue = 0

    for (const gamepad of gamepads) {
        const axisRaw = gamepad.axes[binding.axis] ?? 0
        const deadZone = binding.deadZone ?? 0.15
        const normalized = normalizeGamepadAxis(axisRaw, deadZone)

        let directional = normalized
        if (binding.direction === 'positive') {
            directional = Math.max(normalized, 0)
        } else if (binding.direction === 'negative') {
            directional = Math.max(-normalized, 0)
        }

        const finalValue = binding.invert ? -directional : directional
        if (Math.abs(finalValue) > Math.abs(bestValue)) {
            bestValue = finalValue
        }
    }

    return clamp(bestValue, -1, 1)
}

function resolveGamepadButtonValue(binding: GamepadButtonBinding, gamepads: ReadonlyArray<Gamepad>): number {
    const threshold = binding.threshold ?? 0.5

    for (const gamepad of gamepads) {
        const button = gamepad.buttons[binding.button]
        if (button && button.value >= threshold) {
            return button.value
        }
    }

    return 0
}

function resolveMouseAxisValue(binding: MouseAxisBinding, rawState: RawInputState): number {
    const delta = binding.axis === 'x' ? rawState.mouseDeltaX : rawState.mouseDeltaY
    const sensitivity = binding.sensitivity ?? 1
    const value = delta * sensitivity
    return binding.invert ? -value : value
}

function resolveBindingValue(binding: InputBinding, rawState: RawInputState): number {
    switch (binding.type) {
        case 'keyboard-button':
            return rawState.keysPressed.has(binding.code) ? 1 : 0
        case 'mouse-button':
            return rawState.mouseButtonsPressed.has(binding.button) ? 1 : 0
        case 'mouse-axis':
            return resolveMouseAxisValue(binding, rawState)
        case 'gamepad-button':
            return resolveGamepadButtonValue(binding, rawState.gamepads)
        case 'gamepad-axis':
            return resolveGamepadAxisValue(binding, rawState.gamepads)
        case 'touch-gesture':
            return 0
        case 'xr-component':
            return 0
        default:
            return 0
    }
}

export class BindingResolver {
    resolve(profile: InputProfileDefinition, rawState: RawInputState): ResolvedActionState {
        const axisValues = new Map<InputActionId, number>()
        const buttonValues = new Map<InputActionId, boolean>()

        for (const definition of INPUT_ACTION_DEFINITIONS) {
            const bindings = profile.bindings[definition.id] ?? []

            if (bindings.length === 0) {
                if (definition.type === InputActionType.Axis) {
                    axisValues.set(definition.id, 0)
                } else {
                    buttonValues.set(definition.id, false)
                }
                continue
            }

            if (definition.type === InputActionType.Axis) {
                let axisValue = 0
                for (const binding of bindings) {
                    const value = resolveBindingValue(binding, rawState)
                    if (definition.id === InputAction.LookHorizontal || definition.id === InputAction.LookVertical) {
                        axisValue += value
                    } else {
                        axisValue = Math.max(axisValue, Math.abs(value))
                    }
                }
                if (definition.id === InputAction.LookHorizontal || definition.id === InputAction.LookVertical) {
                    axisValues.set(definition.id, axisValue)
                } else {
                    axisValues.set(definition.id, clamp(axisValue, -1, 1))
                }
            } else {
                let pressed = false
                for (const binding of bindings) {
                    if (resolveBindingValue(binding, rawState) >= 0.5) {
                        pressed = true
                        break
                    }
                }
                buttonValues.set(definition.id, pressed)
            }
        }

        return {
            axes: axisValues,
            buttons: buttonValues
        }
    }
}
