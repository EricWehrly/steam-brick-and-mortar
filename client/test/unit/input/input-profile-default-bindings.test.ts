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
            { type: 'mouse-axis', axis: 'y', sensitivity: 1, label: 'Mouse Y' }
        ])
    })
})
