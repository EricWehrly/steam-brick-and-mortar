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
    MouseAxisBinding,
    XRBinding
} from './InputProfile'

/** User-facing look invert/sensitivity for one device - AppSettings owns the values; bindings
 *  only describe which physical axis reads Look, not how it feels. */
export interface InputAxisTuning {
    invert: boolean
    sensitivity: number
}

/**
 * Per-device look tuning, applied only to LookHorizontal/LookVertical and keyed by whether the
 * contributing binding is mouse-axis or gamepad-axis - optional so call sites that don't care
 * about tuning (most existing tests) can omit it and get a neutral no-op default.
 */
export interface LookTuning {
    mouse: InputAxisTuning
    gamepad: InputAxisTuning
}

const NEUTRAL_DEVICE_LOOK_TUNING: InputAxisTuning = { invert: false, sensitivity: 1 }

const NEUTRAL_LOOK_TUNING: LookTuning = {
    mouse: NEUTRAL_DEVICE_LOOK_TUNING,
    gamepad: NEUTRAL_DEVICE_LOOK_TUNING
}

/** One connected XR controller's gamepad-shaped input, as read off XRInputSource.gamepad. */
export interface XRGamepadState {
    handedness: XRHandedness
    gamepad: Gamepad
}

export interface RawInputState {
    keysPressed: ReadonlySet<string>
    mouseButtonsPressed: ReadonlySet<number>
    mouseDeltaX: number
    mouseDeltaY: number
    gamepads: ReadonlyArray<Gamepad>
    lookTuning?: LookTuning
    /** Optional (defaults to []) so existing hand-built RawInputState test fixtures don't need updating. */
    xrGamepads?: ReadonlyArray<XRGamepadState>
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

interface XRComponentMapEntry {
    kind: 'button' | 'axis'
    index: number
}

/**
 * xr-standard gamepad mapping (W3C-registered; used by virtually every WebXR controller/runtime,
 * and by @webxr-input-profiles/motion-controllers internally). 'menu' has no standardized index -
 * the system/Oculus button is typically OS-reserved on Quest and not exposed to gamepad.buttons
 * at all; button 4 is a best-effort guess for controllers that do expose a secondary button there.
 * See docs/plans/vr-support-plan.md.
 */
// TD: xr-menu-button-mapping-unverified
const XR_STANDARD_COMPONENT_MAP: Readonly<Record<string, XRComponentMapEntry>> = {
    trigger: { kind: 'button', index: 0 },
    squeeze: { kind: 'button', index: 1 },
    'thumbstick-click': { kind: 'button', index: 3 },
    menu: { kind: 'button', index: 4 },
    'thumbstick-x': { kind: 'axis', index: 2 },
    'thumbstick-y': { kind: 'axis', index: 3 }
}

/**
 * Loops all connected XR controllers and keeps the strongest match - same shape as
 * resolveGamepadAxisValue/resolveGamepadButtonValue - so a binding with no handedness pinned
 * (every builtin VR binding today) resolves from either hand for free.
 */
function resolveXRComponentValue(binding: XRBinding, xrGamepads: ReadonlyArray<XRGamepadState>): number {
    const component = XR_STANDARD_COMPONENT_MAP[binding.componentPath]
    if (!component) {
        return 0
    }

    let bestValue = 0
    for (const { handedness, gamepad } of xrGamepads) {
        if (binding.handedness && binding.handedness !== handedness) {
            continue
        }

        const value = component.kind === 'button'
            ? gamepad.buttons[component.index]?.value ?? 0
            : gamepad.axes[component.index] ?? 0

        if (Math.abs(value) > Math.abs(bestValue)) {
            bestValue = value
        }
    }

    return bestValue
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
            return resolveXRComponentValue(binding, rawState.xrGamepads ?? [])
        default:
            return 0
    }
}

function applyLookTuning(binding: InputBinding, value: number, isVerticalLook: boolean, tuning: LookTuning): number {
    if (binding.type !== 'mouse-axis' && binding.type !== 'gamepad-axis') {
        return value
    }

    const deviceTuning = binding.type === 'mouse-axis' ? tuning.mouse : tuning.gamepad
    const tuned = value * deviceTuning.sensitivity
    return isVerticalLook && deviceTuning.invert ? -tuned : tuned
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

    /**
     * Whether an xr-component binding means the given button-index press on the given hand -
     * for use as a findButtonActionsBoundTo predicate, same role gamepad-button/button-index
     * equality plays for handleGamepadButtonPress. A binding with no handedness pinned (every
     * builtin VR binding today) matches either hand.
     */
    matchesXRButtonPress(binding: InputBinding, handedness: XRHandedness, buttonIndex: number): boolean {
        if (binding.type !== 'xr-component') {
            return false
        }

        const component = XR_STANDARD_COMPONENT_MAP[binding.componentPath]
        if (!component || component.kind !== 'button' || component.index !== buttonIndex) {
            return false
        }

        return !binding.handedness || binding.handedness === handedness
    }

    resolve(profile: InputProfileDefinition, rawState: RawInputState): ResolvedActionState {
        const axisValues = new Map<InputActionId, number>()
        const buttonValues = new Map<InputActionId, boolean>()

        for (const definition of INPUT_ACTION_DEFINITIONS) {
            const bindings = profile.bindings[definition.id] ?? []

            if (definition.type === InputActionType.Axis) {
                axisValues.set(definition.id, this.resolveAxisAction(definition.id, bindings, rawState))
            } else {
                buttonValues.set(definition.id, this.resolveButtonAction(bindings, rawState))
            }
        }

        return {
            axes: axisValues,
            buttons: buttonValues
        }
    }

    private resolveAxisAction(actionId: InputActionId, bindings: ReadonlyArray<InputBinding>, rawState: RawInputState): number {
        if (bindings.length === 0) {
            return 0
        }

        const isLookAxis = actionId === InputAction.LookHorizontal || actionId === InputAction.LookVertical
        let axisValue = 0

        for (const binding of bindings) {
            let value = resolveAxisBindingValue(binding, rawState)
            if (isLookAxis) {
                value = applyLookTuning(binding, value, actionId === InputAction.LookVertical, rawState.lookTuning ?? NEUTRAL_LOOK_TUNING)
                axisValue += value
            } else {
                axisValue = Math.max(axisValue, Math.abs(value))
            }
        }

        return isLookAxis ? axisValue : clamp(axisValue, -1, 1)
    }

    private resolveButtonAction(bindings: ReadonlyArray<InputBinding>, rawState: RawInputState): boolean {
        return bindings.some(binding => Math.abs(resolveBindingValue(binding, rawState)) >= 0.5)
    }
}
