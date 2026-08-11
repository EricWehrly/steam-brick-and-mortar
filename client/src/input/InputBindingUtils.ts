import { getInputActionDefinition, InputAction, type InputActionId } from './InputActions'
import type { GamepadAxisBinding, InputBinding, InputProfileDefinition, MouseAxisBinding } from './InputProfile'

const LINKED_AXIS_ACTIONS: ReadonlyArray<readonly [InputActionId, InputActionId]> = [
    [InputAction.MoveForward, InputAction.MoveBack],
    [InputAction.MoveLeft, InputAction.MoveRight],
    [InputAction.MoveUp, InputAction.MoveDown]
]

function getLinkedDerivedAction(actionId: InputActionId): InputActionId | null {
    for (const [sourceAction, derivedAction] of LINKED_AXIS_ACTIONS) {
        if (sourceAction === actionId) {
            return derivedAction
        }
    }

    return null
}

function normalizeBindingSignature(binding: InputBinding): string {
    switch (binding.type) {
        case 'keyboard-button':
            return `${binding.type}:${binding.code}:${binding.direction ?? 'positive'}`
        case 'mouse-button':
            return `${binding.type}:${binding.button}:${binding.direction ?? 'positive'}`
        case 'mouse-axis':
            return `${binding.type}:${binding.axis}:${binding.invert === true ? '1' : '0'}:${binding.sensitivity ?? 1}`
        case 'gamepad-button':
            return `${binding.type}:${binding.button}:${binding.threshold ?? 0.5}:${binding.direction ?? 'positive'}:${binding.handedness ?? 'none'}`
        case 'gamepad-axis':
            return `${binding.type}:${binding.axis}:${binding.direction ?? 'both'}:${binding.deadZone ?? 0.15}:${binding.invert === true ? '1' : '0'}:${binding.handedness ?? 'none'}`
        case 'touch-gesture':
            return `${binding.type}:${binding.gesture}`
        default:
            return 'unknown'
    }
}

function isInvertibleAxisBinding(binding: InputBinding): binding is GamepadAxisBinding | MouseAxisBinding {
    return binding.type === 'gamepad-axis' || binding.type === 'mouse-axis'
}

function invertAxisBinding(binding: GamepadAxisBinding | MouseAxisBinding): GamepadAxisBinding | MouseAxisBinding {
    if (binding.type === 'mouse-axis') {
        return {
            ...binding,
            invert: !binding.invert
        }
    }

    if (binding.direction === 'positive') {
        return {
            ...binding,
            direction: 'negative'
        }
    }

    if (binding.direction === 'negative') {
        return {
            ...binding,
            direction: 'positive'
        }
    }

    return {
        ...binding,
        invert: !binding.invert
    }
}

export function getLinkedInverseAssignment(actionId: InputActionId, binding: InputBinding): { actionId: InputActionId; binding: InputBinding } | null {
    const derivedAction = getLinkedDerivedAction(actionId)
    if (!derivedAction) {
        return null
    }

    if (!isInvertibleAxisBinding(binding)) {
        return null
    }

    const inverseBinding = invertAxisBinding(binding)

    return {
        actionId: derivedAction,
        binding: inverseBinding
    }
}

export function isDerivedLinkedActionLocked(profile: InputProfileDefinition, actionId: InputActionId): boolean {
    for (const [sourceAction, derivedAction] of LINKED_AXIS_ACTIONS) {
        if (derivedAction !== actionId) {
            continue
        }

        const sourceBindings = profile.bindings[sourceAction] ?? []
        return sourceBindings.some(isInvertibleAxisBinding)
    }

    return false
}

export function getDuplicateBindingWarnings(profile: InputProfileDefinition): ReadonlyMap<InputActionId, string> {
    const bindingToActions = new Map<string, Set<InputActionId>>()

    for (const [actionId, bindings] of Object.entries(profile.bindings) as Array<[InputActionId, ReadonlyArray<InputBinding>]>) {
        for (const binding of bindings) {
            const signature = normalizeBindingSignature(binding)
            const actions = bindingToActions.get(signature) ?? new Set<InputActionId>()
            actions.add(actionId)
            bindingToActions.set(signature, actions)
        }
    }

    const warnings = new Map<InputActionId, string>()

    for (const actions of bindingToActions.values()) {
        if (actions.size < 2) {
            continue
        }

        const actionIds = Array.from(actions)
        for (const actionId of actionIds) {
            const others = actionIds
                .filter(candidate => candidate !== actionId)
                .map(candidate => getInputActionDefinition(candidate).label)
            if (others.length === 0) {
                continue
            }

            const existing = warnings.get(actionId)
            const message = `Also bound to ${others.join(', ')}`
            warnings.set(actionId, existing ? `${existing}; ${message}` : message)
        }
    }

    return warnings
}