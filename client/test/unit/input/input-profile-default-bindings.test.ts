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
})
