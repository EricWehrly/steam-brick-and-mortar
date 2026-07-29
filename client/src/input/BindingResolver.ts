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
    AxisDirection,
    MouseAxisBinding
} from './InputProfile'

/**
 * User-facing look invert/sensitivity, set independently per device (AppSettings owns the
 * values; bindings only describe which physical axis reads Look, not how it feels). Applied only
 * to LookHorizontal/LookVertical, keyed by whether the contributing binding is mouse-axis or
 * gamepad-axis - optional so call sites that don't care about tuning (most existing tests) can
 * omit it and get a neutral no-op default.
 */
export interface LookTuning {
    invertMouse: boolean
    invertGamepad: boolean
    sensitivityMouse: number
    sensitivityGamepad: number
}

const NEUTRAL_LOOK_TUNING: LookTuning = {
    invertMouse: false,
    invertGamepad: false,
    sensitivityMouse: 1,
    sensitivityGamepad: 1
}

export interface RawInputState {
    keysPressed: ReadonlySet<string>
    mouseButtonsPressed: ReadonlySet<number>
    mouseDeltaX: number
    mouseDeltaY: number
    gamepads: ReadonlyArray<Gamepad>
    lookTuning?: LookTuning
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

    const sensitivity = binding.sensitivity ?? 1
    return clamp(bestValue, -1, 1) * sensitivity
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

function applyLookTuning(binding: InputBinding, value: number, isVerticalLook: boolean, tuning: LookTuning): number {
    if (binding.type !== 'mouse-axis' && binding.type !== 'gamepad-axis') {
        return value
    }

    const sensitivity = binding.type === 'mouse-axis' ? tuning.sensitivityMouse : tuning.sensitivityGamepad
    const invert = binding.type === 'mouse-axis' ? tuning.invertMouse : tuning.invertGamepad

    const tuned = value * sensitivity
    return isVerticalLook && invert ? -tuned : tuned
}

function isButtonBinding(binding: InputBinding): binding is Extract<InputBinding, { type: 'keyboard-button' | 'mouse-button' | 'gamepad-button' }> {
    return binding.type === 'keyboard-button' || binding.type === 'mouse-button' || binding.type === 'gamepad-button'
}

function resolveAxisBindingValue(binding: InputBinding, rawState: RawInputState): number {
    const rawValue = resolveBindingValue(binding, rawState)
    if (!isButtonBinding(binding)) {
        return rawValue
    }

    const direction: AxisDirection = binding.direction ?? 'positive'
    const magnitude = Math.abs(rawValue)
    return direction === 'negative' ? -magnitude : magnitude
}

export class BindingResolver {
    /**
     * Which button-type actions in this profile have a binding matching the given predicate -
     * used to resolve a single raw press (a specific keyboard code, mouse button, or gamepad
     * button) into the action(s) it triggers, without waiting for the next resolve() frame.
     * Axis-type actions are excluded even though some (MoveForward/Back/Left/Right) use
     * keyboard-button/gamepad-button bindings to simulate a directional axis - those are
     * continuously applied via resolve(), not "pressed" in the trigger-once sense.
     */
    findButtonActionsBoundTo(profile: InputProfileDefinition, matches: (binding: InputBinding) => boolean): InputActionId[] {
        const actionIds: InputActionId[] = []

        for (const definition of INPUT_ACTION_DEFINITIONS) {
            if (definition.type !== InputActionType.Button) {
                continue
            }

            const bindings = profile.bindings[definition.id] ?? []
            if (bindings.some(matches)) {
                actionIds.push(definition.id)
            }
        }

        return actionIds
    }

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
                const isLookAxis = definition.id === InputAction.LookHorizontal || definition.id === InputAction.LookVertical
                let axisValue = 0
                for (const binding of bindings) {
                    let value = resolveAxisBindingValue(binding, rawState)
                    if (isLookAxis) {
                        value = applyLookTuning(binding, value, definition.id === InputAction.LookVertical, rawState.lookTuning ?? NEUTRAL_LOOK_TUNING)
                    }
                    if (isLookAxis) {
                        axisValue += value
                    } else {
                        axisValue = Math.max(axisValue, Math.abs(value))
                    }
                }
                if (isLookAxis) {
                    axisValues.set(definition.id, axisValue)
                } else {
                    axisValues.set(definition.id, clamp(axisValue, -1, 1))
                }
            } else {
                let pressed = false
                for (const binding of bindings) {
                    if (Math.abs(resolveBindingValue(binding, rawState)) >= 0.5) {
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
