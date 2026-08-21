import { InputAction, type InputActionId } from './InputActions'

export const InputProfileId = {
    MouseKeyboard: 'mouse-keyboard',
    GamepadStandard: 'gamepad-standard',
    Touch: 'touch',
    VR: 'vr'
} as const

export type InputProfileIdValue = typeof InputProfileId[keyof typeof InputProfileId]

export const InputDeviceKind = {
    MouseKeyboard: 'mouse-keyboard',
    Gamepad: 'gamepad',
    Touch: 'touch',
    VR: 'vr'
} as const

export type InputDeviceKindValue = typeof InputDeviceKind[keyof typeof InputDeviceKind]

export type AxisDirection = 'positive' | 'negative'

export interface KeyboardButtonBinding {
    type: 'keyboard-button'
    code: string
    direction?: AxisDirection
    label?: string
}

export interface MouseButtonBinding {
    type: 'mouse-button'
    button: number
    direction?: AxisDirection
    label?: string
}

export interface MouseAxisBinding {
    type: 'mouse-axis'
    axis: 'x' | 'y'
    invert?: boolean
    sensitivity?: number
    label?: string
}

/**
 * Which XR hand a gamepad-button/gamepad-axis binding reads from. This field's mere PRESENCE (even
 * 'any') is what decides the binding's *source*, not just a filter on top of it: absent means
 * "read navigator.getGamepads() gamepads, never an XR controller"; present means "read connected
 * XR controllers' gamepad-shaped input, never a plain physical gamepad" ('any' = whichever hand is
 * active, 'left'/'right' pins to one). A real XRInputSource's own handedness can be the literal
 * WebXR value 'none' (e.g. a non-handed input source) - 'any' is a distinct sentinel so that case
 * is never confused with "hand doesn't matter, match anything".
 * See BindingResolver's resolveGamepadButtonValue/resolveGamepadAxisValue for the source split -
 * this is what let VR controllers reuse the plain gamepad-button/gamepad-axis binding types
 * instead of a parallel xr-component mechanism (see docs/plans/vr-support-plan.md's addendum).
 */
export type GamepadBindingHandedness = XRHandedness | 'any'

export interface GamepadButtonBinding {
    type: 'gamepad-button'
    button: number
    threshold?: number
    direction?: AxisDirection
    handedness?: GamepadBindingHandedness
    label?: string
}

export interface GamepadAxisBinding {
    type: 'gamepad-axis'
    axis: number
    direction?: 'positive' | 'negative' | 'both'
    deadZone?: number
    invert?: boolean
    sensitivity?: number
    handedness?: GamepadBindingHandedness
    label?: string
}

export interface TouchBinding {
    type: 'touch-gesture'
    gesture: 'tap' | 'double-tap' | 'drag' | 'swipe'
    label?: string
}

export type InputBinding =
    | KeyboardButtonBinding
    | MouseButtonBinding
    | MouseAxisBinding
    | GamepadButtonBinding
    | GamepadAxisBinding
    | TouchBinding

export interface InputProfileDefinition {
    id: InputProfileIdValue
    name: string
    deviceKind: InputDeviceKindValue
    enabled: boolean
    bindings: Partial<Record<InputActionId, ReadonlyArray<InputBinding>>>
}

export function cloneBinding(binding: InputBinding): InputBinding {
    return { ...binding }
}

export function cloneProfile(profile: InputProfileDefinition): InputProfileDefinition {
    const clonedBindings: Partial<Record<InputActionId, ReadonlyArray<InputBinding>>> = {}
    for (const [actionId, actionBindings] of Object.entries(profile.bindings) as Array<[InputActionId, ReadonlyArray<InputBinding>]>) {
        clonedBindings[actionId] = actionBindings.map(cloneBinding)
    }

    return {
        ...profile,
        bindings: clonedBindings
    }
}

export function formatBindingLabel(binding: InputBinding): string {
    if (binding.label) {
        return binding.label
    }

    const directionalSuffix =
        'direction' in binding && binding.direction
            ? binding.direction === 'positive' ? ' (+)' : ' (-)'
            : ''

    switch (binding.type) {
        case 'keyboard-button':
            return `${binding.code}${directionalSuffix}`
        case 'mouse-button':
            return `${binding.button === 0 ? 'Left Click' : `Mouse ${binding.button}`}${directionalSuffix}`
        case 'mouse-axis':
            return binding.axis === 'x' ? 'Mouse X' : 'Mouse Y'
        case 'gamepad-button':
            return `Gamepad Button ${binding.button}${directionalSuffix}`
        case 'gamepad-axis':
            return `Gamepad Axis ${binding.axis}`
        case 'touch-gesture':
            return `Touch ${binding.gesture}`
        default:
            return 'Unknown Binding'
    }
}

export function formatBindingList(bindings: ReadonlyArray<InputBinding> | undefined): string {
    if (!bindings || bindings.length === 0) {
        return 'Unbound'
    }

    return bindings.map(formatBindingLabel).join(' / ')
}

export const BUILTIN_INPUT_PROFILES: ReadonlyArray<InputProfileDefinition> = [
    {
        id: InputProfileId.MouseKeyboard,
        name: 'Mouse + Keyboard',
        deviceKind: InputDeviceKind.MouseKeyboard,
        enabled: true,
        bindings: {
            [InputAction.MoveForward]: [
                { type: 'keyboard-button', code: 'KeyW', label: 'W' },
                { type: 'keyboard-button', code: 'ArrowUp', label: 'Up' }
            ],
            [InputAction.MoveBack]: [
                { type: 'keyboard-button', code: 'KeyS', label: 'S' },
                { type: 'keyboard-button', code: 'ArrowDown', label: 'Down' }
            ],
            [InputAction.MoveLeft]: [
                { type: 'keyboard-button', code: 'KeyA', label: 'A' },
                { type: 'keyboard-button', code: 'ArrowLeft', label: 'Left' }
            ],
            [InputAction.MoveRight]: [
                { type: 'keyboard-button', code: 'KeyD', label: 'D' },
                { type: 'keyboard-button', code: 'ArrowRight', label: 'Right' }
            ],
            [InputAction.MoveUp]: [
                { type: 'keyboard-button', code: 'Space', label: 'Space' }
            ],
            [InputAction.MoveDown]: [
                { type: 'keyboard-button', code: 'KeyC', label: 'C' }
            ],
            [InputAction.LookHorizontal]: [
                { type: 'mouse-axis', axis: 'x', label: 'Mouse X' }
            ],
            [InputAction.LookVertical]: [
                { type: 'mouse-axis', axis: 'y', label: 'Mouse Y' }
            ],
            [InputAction.Interact]: [
                { type: 'mouse-button', button: 0, label: 'Left Click' },
                { type: 'keyboard-button', code: 'Enter', label: 'Enter' }
            ],
            [InputAction.OpenMenu]: [
                { type: 'keyboard-button', code: 'Escape', label: 'Escape' }
            ],
            [InputAction.Cancel]: [
                { type: 'keyboard-button', code: 'Escape', label: 'Escape' }
            ],
            [InputAction.Sprint]: [
                { type: 'keyboard-button', code: 'ShiftLeft', label: 'Left Shift' },
                { type: 'keyboard-button', code: 'ShiftRight', label: 'Right Shift' }
            ]
        }
    },
    {
        id: InputProfileId.GamepadStandard,
        name: 'Standard Game Controller',
        deviceKind: InputDeviceKind.Gamepad,
        enabled: true,
        bindings: {
            [InputAction.MoveForward]: [{ type: 'gamepad-axis', axis: 1, direction: 'negative', deadZone: 0.15, label: 'Left Stick Up' }],
            [InputAction.MoveBack]: [{ type: 'gamepad-axis', axis: 1, direction: 'positive', deadZone: 0.15, label: 'Left Stick Down' }],
            [InputAction.MoveLeft]: [{ type: 'gamepad-axis', axis: 0, direction: 'negative', deadZone: 0.15, label: 'Left Stick Left' }],
            [InputAction.MoveRight]: [{ type: 'gamepad-axis', axis: 0, direction: 'positive', deadZone: 0.15, label: 'Left Stick Right' }],
            [InputAction.LookHorizontal]: [{ type: 'gamepad-axis', axis: 2, direction: 'both', deadZone: 0.15, label: 'Right Stick X' }],
            [InputAction.LookVertical]: [{ type: 'gamepad-axis', axis: 3, direction: 'both', deadZone: 0.15, label: 'Right Stick Y' }],
            [InputAction.Interact]: [{ type: 'gamepad-button', button: 0, label: 'A / Cross' }],
            [InputAction.OpenMenu]: [{ type: 'gamepad-button', button: 9, label: 'Menu / Start' }],
            [InputAction.Cancel]: [
                { type: 'gamepad-button', button: 1, label: 'B / Circle' },
                { type: 'gamepad-button', button: 9, label: 'Menu / Start' }
            ],
            [InputAction.ResetCamera]: [{ type: 'gamepad-button', button: 11, label: 'Right Stick Press' }],
            [InputAction.Sprint]: [{ type: 'gamepad-button', button: 10, label: 'Left Stick Press' }]
        }
    },
    {
        id: InputProfileId.Touch,
        name: 'Touch',
        deviceKind: InputDeviceKind.Touch,
        enabled: true,
        bindings: {
            [InputAction.Interact]: [{ type: 'touch-gesture', gesture: 'tap', label: 'Tap' }],
            [InputAction.OpenMenu]: [{ type: 'touch-gesture', gesture: 'double-tap', label: 'Double Tap' }],
            [InputAction.LookHorizontal]: [{ type: 'touch-gesture', gesture: 'drag', label: 'Drag Horizontal' }]
        }
    },
    {
        id: InputProfileId.VR,
        name: 'VR Motion Controllers',
        deviceKind: InputDeviceKind.VR,
        enabled: true,
        bindings: {
            // Raw xr-standard indices (W3C-registered, same universal mapping every WebXR
            // runtime/controller uses) - button/axis indices confirmed empirically against real
            // Oculus-Touch/PICO-Connect hardware: trigger=0, squeeze=1, thumbstick-click=3,
            // thumbstick-x=axis 2, thumbstick-y=axis 3. These are plain gamepad-button/gamepad-axis
            // bindings, same as GamepadStandard's - the `handedness` field is what routes them to
            // read XR controllers instead of navigator.getGamepads() (see GamepadBindingHandedness's
            // doc comment). menu=4 confirmed against real headset hardware 2026-08-19.
            [InputAction.Interact]: [{ type: 'gamepad-button', button: 0, handedness: 'any', label: 'Trigger' }],
            // Cancel is the same generic "back out" action Cancel already means everywhere else
            // (pause menu, binder UI, debug inspector) - for a summoned game box specifically,
            // GameBoxFoldCoordinator.handleCancelPressed() is what "drop"/put-back means. Squeeze
            // was previously left unbound; grip is the natural opposite-hand-motion pairing with
            // trigger's "grab".
            [InputAction.Cancel]: [{ type: 'gamepad-button', button: 1, handedness: 'any', label: 'Grip / Squeeze' }],
            [InputAction.OpenMenu]: [{ type: 'gamepad-button', button: 4, handedness: 'any', label: 'Menu Button' }],
            // Left thumbstick = movement, right = look/turn - real VR convention, and keeps each
            // stick single-purpose (left no longer double-claimed by Look, which is a no-op
            // in-session anyway per WebXRCoordinator's rotation-skip - see its own doc comment).
            [InputAction.MoveForward]: [{ type: 'gamepad-axis', axis: 3, direction: 'negative', handedness: 'left', label: 'Left Thumbstick Up' }],
            [InputAction.MoveBack]: [{ type: 'gamepad-axis', axis: 3, direction: 'positive', handedness: 'left', label: 'Left Thumbstick Down' }],
            [InputAction.MoveLeft]: [{ type: 'gamepad-axis', axis: 2, direction: 'negative', handedness: 'left', label: 'Left Thumbstick Left' }],
            [InputAction.MoveRight]: [{ type: 'gamepad-axis', axis: 2, direction: 'positive', handedness: 'left', label: 'Left Thumbstick Right' }],
            [InputAction.SprintToggle]: [{ type: 'gamepad-button', button: 3, handedness: 'left', label: 'Left Thumbstick Click' }],
            [InputAction.LookHorizontal]: [{ type: 'gamepad-axis', axis: 2, handedness: 'right', label: 'Right Thumbstick X' }],
            [InputAction.LookVertical]: [{ type: 'gamepad-axis', axis: 3, handedness: 'right', label: 'Right Thumbstick Y' }]
        }
    }
]
