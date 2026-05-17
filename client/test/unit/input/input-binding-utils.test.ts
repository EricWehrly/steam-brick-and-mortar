import { describe, expect, it } from 'vitest'
import { InputAction } from '../../../src/input/InputActions'
import { getDuplicateBindingWarnings, getLinkedInverseAssignment, isDerivedLinkedActionLocked } from '../../../src/input/InputBindingUtils'
import { BUILTIN_INPUT_PROFILES, InputProfileId, type InputProfileDefinition } from '../../../src/input/InputProfile'

function getProfile() {
    const profile = BUILTIN_INPUT_PROFILES.find(candidate => candidate.id === InputProfileId.MouseKeyboard)
    if (!profile) {
        throw new Error('Missing mouse keyboard profile')
    }
    return profile
}

describe('InputBindingUtils', () => {
    it('creates inverse linked assignment for gamepad axis movement bindings', () => {
        const linked = getLinkedInverseAssignment(InputAction.MoveLeft, {
            type: 'gamepad-axis',
            axis: 0,
            direction: 'negative',
            deadZone: 0.15,
            label: 'Left Stick X'
        })

        expect(linked).not.toBeNull()
        expect(linked?.actionId).toBe(InputAction.MoveRight)
        expect(linked?.binding.type).toBe('gamepad-axis')
        if (linked?.binding.type === 'gamepad-axis') {
            expect(linked.binding.direction).toBe('positive')
        }
    })

    it('locks derived movement action when source uses invertible axis binding', () => {
        const profile: InputProfileDefinition = {
            ...getProfile(),
            bindings: {
                ...getProfile().bindings,
                [InputAction.MoveLeft]: [{ type: 'mouse-axis', axis: 'x', sensitivity: 1 } as const]
            }
        }

        expect(isDerivedLinkedActionLocked(profile, InputAction.MoveRight)).toBe(true)
        expect(isDerivedLinkedActionLocked(profile, InputAction.MoveLeft)).toBe(false)
    })

    it('detects duplicate bindings across actions for warning display', () => {
        const profile: InputProfileDefinition = {
            ...getProfile(),
            bindings: {
                ...getProfile().bindings,
                [InputAction.Interact]: [{ type: 'keyboard-button', code: 'KeyE', label: 'E' } as const],
                [InputAction.OpenMenu]: [{ type: 'keyboard-button', code: 'KeyE', label: 'E' } as const]
            }
        }

        const warnings = getDuplicateBindingWarnings(profile)
        expect(warnings.get(InputAction.Interact)).toContain('Open Menu')
        expect(warnings.get(InputAction.OpenMenu)).toContain('Interact')
    })
})