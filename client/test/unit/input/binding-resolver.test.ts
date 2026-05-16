import { describe, expect, it } from 'vitest'
import { BindingResolver } from '../../../src/input/BindingResolver'
import { BUILTIN_INPUT_PROFILES, InputProfileId } from '../../../src/input/InputProfile'
import { InputAction } from '../../../src/input/InputActions'

function getProfile(profileId: string) {
    const profile = BUILTIN_INPUT_PROFILES.find(candidate => candidate.id === profileId)
    if (!profile) {
        throw new Error(`Missing profile: ${profileId}`)
    }

    return profile
}

describe('BindingResolver', () => {
    it('resolves keyboard movement bindings', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const state = resolver.resolve(mouseKeyboardProfile, {
            keysPressed: new Set(['KeyW']),
            mouseButtonsPressed: new Set(),
            mouseDeltaX: 0,
            mouseDeltaY: 0,
            gamepads: []
        })

        expect(state.axes.get(InputAction.MoveForward)).toBe(1)
        expect(state.axes.get(InputAction.MoveBack)).toBe(0)
    })

    it('resolves mouse look axis bindings', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const state = resolver.resolve(mouseKeyboardProfile, {
            keysPressed: new Set(),
            mouseButtonsPressed: new Set([0]),
            mouseDeltaX: 8,
            mouseDeltaY: 0,
            gamepads: []
        })

        expect(state.axes.get(InputAction.LookHorizontal)).toBe(8)
        expect(state.buttons.get(InputAction.Interact)).toBe(true)
    })

    it('resolves gamepad axes and buttons', () => {
        const resolver = new BindingResolver()
        const gamepadProfile = getProfile(InputProfileId.GamepadStandard)

        const gamepad = {
            connected: true,
            id: 'Test Pad',
            index: 0,
            mapping: 'standard',
            axes: [0.5, -0.75, 0.25, 0],
            buttons: Array.from({ length: 12 }, (_, index) => ({
                pressed: index === 0,
                touched: false,
                value: index === 0 ? 1 : 0
            })),
            vibrationActuator: null
        } as unknown as Gamepad

        const state = resolver.resolve(gamepadProfile, {
            keysPressed: new Set(),
            mouseButtonsPressed: new Set(),
            mouseDeltaX: 0,
            mouseDeltaY: 0,
            gamepads: [gamepad]
        })

        expect((state.axes.get(InputAction.MoveForward) ?? 0) > 0).toBe(true)
        expect((state.axes.get(InputAction.MoveRight) ?? 0) > 0).toBe(true)
        expect(state.buttons.get(InputAction.Interact)).toBe(true)
    })
})
