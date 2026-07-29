import { describe, it, expect } from 'vitest'
import { BUILTIN_INPUT_PROFILES, InputProfileId } from '../../../src/input/InputProfile'
import { InputAction } from '../../../src/input/InputActions'

describe('MouseKeyboard profile default bindings', () => {
    it('ships with no default binding for RollLeft or RollRight', () => {
        const mouseKeyboardProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.MouseKeyboard
        )

        expect(mouseKeyboardProfile).toBeDefined()
        expect(mouseKeyboardProfile?.bindings[InputAction.RollLeft]).toBeUndefined()
        expect(mouseKeyboardProfile?.bindings[InputAction.RollRight]).toBeUndefined()
    })

    it('ships with no default binding for ResetCamera', () => {
        const mouseKeyboardProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.MouseKeyboard
        )

        expect(mouseKeyboardProfile?.bindings[InputAction.ResetCamera]).toBeUndefined()
    })

    it('binds LookVertical to Mouse Y by default, alongside LookHorizontal on Mouse X', () => {
        const mouseKeyboardProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.MouseKeyboard
        )

        expect(mouseKeyboardProfile?.bindings[InputAction.LookVertical]).toEqual([
            { type: 'mouse-axis', axis: 'y', label: 'Mouse Y' }
        ])
    })

    it('ships with a default binding for Cancel (Escape), alongside OpenMenu', () => {
        const mouseKeyboardProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.MouseKeyboard
        )

        expect(mouseKeyboardProfile?.bindings[InputAction.Cancel]).toEqual([
            { type: 'keyboard-button', code: 'Escape', label: 'Escape' }
        ])
    })
})

describe('GamepadStandard profile default bindings', () => {
    it('binds ResetCamera to the right stick press (R3) by default', () => {
        const gamepadProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.GamepadStandard
        )

        expect(gamepadProfile?.bindings[InputAction.ResetCamera]).toEqual([
            { type: 'gamepad-button', button: 11, label: 'Right Stick Press' }
        ])
    })

    it('binds Cancel to both B/Circle and Menu/Start, alongside OpenMenu on Start', () => {
        const gamepadProfile = BUILTIN_INPUT_PROFILES.find(
            profile => profile.id === InputProfileId.GamepadStandard
        )

        expect(gamepadProfile?.bindings[InputAction.Cancel]).toEqual([
            { type: 'gamepad-button', button: 1, label: 'B / Circle' },
            { type: 'gamepad-button', button: 9, label: 'Menu / Start' }
        ])
        expect(gamepadProfile?.bindings[InputAction.OpenMenu]).toEqual([
            { type: 'gamepad-button', button: 9, label: 'Menu / Start' }
        ])
    })
})
