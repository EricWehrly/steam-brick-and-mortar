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

export interface GamepadButtonBinding {
    type: 'gamepad-button'
    button: number
    threshold?: number
    direction?: AxisDirection
    label?: string
}

export interface GamepadAxisBinding {
    type: 'gamepad-axis'
    axis: number
    direction?: 'positive' | 'negative' | 'both'
    deadZone?: number
    invert?: boolean
    sensitivity?: number
    label?: string
}

export interface TouchBinding {
    type: 'touch-gesture'
    gesture: 'tap' | 'double-tap' | 'drag' | 'swipe'
    label?: string
}

export interface XRBinding {
    type: 'xr-component'
    handedness?: 'left' | 'right' | 'none'
    componentPath: string
    /** For an axis component (e.g. thumbstick-x/y) bound to a directional action (MoveForward/
     *  MoveLeft/...), same role as GamepadAxisBinding's direction: split the signed axis value
     *  into a clamped positive-only magnitude for that one direction. */
    direction?: AxisDirection
    label?: string
}

export type InputBinding =
    | KeyboardButtonBinding
    | MouseButtonBinding
    | MouseAxisBinding
    | GamepadButtonBinding
    | GamepadAxisBinding
    | TouchBinding
    | XRBinding

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
        case 'xr-component':
            return binding.componentPath
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
            [InputAction.Interact]: [{ type: 'xr-component', componentPath: 'trigger', label: 'Trigger' }],
            [InputAction.OpenMenu]: [{ type: 'xr-component', componentPath: 'menu', label: 'Menu Button' }],
            // Left thumbstick = movement, right = look/turn - real VR convention, and keeps each
            // stick single-purpose (left no longer double-claimed by Look, which is a no-op
            // in-session anyway per WebXRCoordinator's rotation-skip - see its own doc comment).
            [InputAction.MoveForward]: [{ type: 'xr-component', handedness: 'left', componentPath: 'thumbstick-y', direction: 'negative', label: 'Left Thumbstick Up' }],
            [InputAction.MoveBack]: [{ type: 'xr-component', handedness: 'left', componentPath: 'thumbstick-y', direction: 'positive', label: 'Left Thumbstick Down' }],
            [InputAction.MoveLeft]: [{ type: 'xr-component', handedness: 'left', componentPath: 'thumbstick-x', direction: 'negative', label: 'Left Thumbstick Left' }],
            [InputAction.MoveRight]: [{ type: 'xr-component', handedness: 'left', componentPath: 'thumbstick-x', direction: 'positive', label: 'Left Thumbstick Right' }],
            [InputAction.SprintToggle]: [{ type: 'xr-component', handedness: 'left', componentPath: 'thumbstick-click', label: 'Left Thumbstick Click' }],
            [InputAction.LookHorizontal]: [{ type: 'xr-component', handedness: 'right', componentPath: 'thumbstick-x', label: 'Right Thumbstick X' }],
            [InputAction.LookVertical]: [{ type: 'xr-component', handedness: 'right', componentPath: 'thumbstick-y', label: 'Right Thumbstick Y' }]
        }
    }
]
