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

    it('resolves mouse look vertical axis bindings', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const state = resolver.resolve(mouseKeyboardProfile, {
            keysPressed: new Set(),
            mouseButtonsPressed: new Set([2]),
            mouseDeltaX: 0,
            mouseDeltaY: 5,
            gamepads: []
        })

        expect(state.axes.get(InputAction.LookVertical)).toBe(5)
    })

    it('applies a gamepad axis binding sensitivity multiplier after the dead-zone clamp', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const gamepad = {
            connected: true,
            id: 'Test Pad',
            index: 0,
            mapping: 'standard',
            axes: [1, 0, 0, 0],
            buttons: [],
            vibrationActuator: null
        } as unknown as Gamepad

        const state = resolver.resolve(
            {
                ...mouseKeyboardProfile,
                bindings: {
                    [InputAction.LookHorizontal]: [
                        { type: 'gamepad-axis', axis: 0, direction: 'both', deadZone: 0.15, sensitivity: 2 }
                    ]
                }
            },
            {
                keysPressed: new Set(),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 0,
                mouseDeltaY: 0,
                gamepads: [gamepad]
            }
        )

        // Full stick deflection clamps to 1 first, then the binding's sensitivity multiplies it -
        // sensitivity must apply after the dead-zone clamp, or it would be clamped away too.
        expect(state.axes.get(InputAction.LookHorizontal)).toBe(2)
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

    it('supports directional button bindings for axis actions', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const state = resolver.resolve(
            {
                ...mouseKeyboardProfile,
                bindings: {
                    ...mouseKeyboardProfile.bindings,
                    [InputAction.LookHorizontal]: [
                        { type: 'keyboard-button', code: 'KeyJ', direction: 'negative' },
                        { type: 'keyboard-button', code: 'KeyL', direction: 'positive' }
                    ]
                }
            },
            {
                keysPressed: new Set(['KeyJ']),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 0,
                mouseDeltaY: 0,
                gamepads: []
            }
        )

        expect(state.axes.get(InputAction.LookHorizontal)).toBe(-1)
    })

    it('still resolves button actions when directional metadata is present', () => {
        const resolver = new BindingResolver()
        const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

        const state = resolver.resolve(
            {
                ...mouseKeyboardProfile,
                bindings: {
                    ...mouseKeyboardProfile.bindings,
                    [InputAction.Interact]: [{ type: 'keyboard-button', code: 'KeyE', direction: 'negative' }]
                }
            },
            {
                keysPressed: new Set(['KeyE']),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 0,
                mouseDeltaY: 0,
                gamepads: []
            }
        )

        expect(state.buttons.get(InputAction.Interact)).toBe(true)
    })

    describe('findButtonActionsBoundTo', () => {
        it('finds every button action bound to a raw keyboard code', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const actionIds = resolver.findButtonActionsBoundTo(
                mouseKeyboardProfile,
                binding => binding.type === 'keyboard-button' && binding.code === 'Escape'
            )

            expect(actionIds).toEqual([InputAction.OpenMenu, InputAction.Cancel])
        })

        it('excludes axis actions even though they use keyboard-button bindings (e.g. movement keys)', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const actionIds = resolver.findButtonActionsBoundTo(
                mouseKeyboardProfile,
                binding => binding.type === 'keyboard-button' && binding.code === 'KeyW'
            )

            expect(actionIds).toEqual([])
        })

        it('returns an empty array when nothing matches', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const actionIds = resolver.findButtonActionsBoundTo(
                mouseKeyboardProfile,
                binding => binding.type === 'keyboard-button' && binding.code === 'KeyZ'
            )

            expect(actionIds).toEqual([])
        })
    })

    describe('lookTuning', () => {
        it('applies the mouse sensitivity multiplier to LookHorizontal, independent of gamepad sensitivity', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const state = resolver.resolve(mouseKeyboardProfile, {
                keysPressed: new Set(),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 3,
                mouseDeltaY: 0,
                gamepads: [],
                lookTuning: { invertMouse: false, invertGamepad: false, sensitivityMouse: 4, sensitivityGamepad: 1 }
            })

            expect(state.axes.get(InputAction.LookHorizontal)).toBe(12)
        })

        it('inverts LookVertical for mouse when invertMouse is set, without affecting LookHorizontal', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const state = resolver.resolve(mouseKeyboardProfile, {
                keysPressed: new Set(),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 5,
                mouseDeltaY: 5,
                gamepads: [],
                lookTuning: { invertMouse: true, invertGamepad: false, sensitivityMouse: 1, sensitivityGamepad: 1 }
            })

            expect(state.axes.get(InputAction.LookVertical)).toBe(-5)
            expect(state.axes.get(InputAction.LookHorizontal)).toBe(5)
        })

        it('applies gamepad sensitivity/invert independently of the mouse tuning', () => {
            const resolver = new BindingResolver()
            const gamepadProfile = getProfile(InputProfileId.GamepadStandard)
            const gamepad = {
                connected: true,
                index: 0,
                axes: [0, 0, 0, -1],
                buttons: []
            } as unknown as Gamepad

            const state = resolver.resolve(gamepadProfile, {
                keysPressed: new Set(),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 0,
                mouseDeltaY: 0,
                gamepads: [gamepad],
                lookTuning: { invertMouse: false, invertGamepad: true, sensitivityMouse: 99, sensitivityGamepad: 2 }
            })

            // Full stick deflection (-1) normalizes to -1 past the dead zone, sensitivity 2x = -2,
            // then invertGamepad flips LookVertical's sign to 2 - the mouse's 99x sensitivity must
            // have no bearing here since no mouse-axis binding contributed.
            expect(state.axes.get(InputAction.LookVertical)).toBe(2)
        })

        it('defaults to a neutral (no-op) tuning when omitted, preserving the binding-level sensitivity', () => {
            const resolver = new BindingResolver()
            const mouseKeyboardProfile = getProfile(InputProfileId.MouseKeyboard)

            const state = resolver.resolve(mouseKeyboardProfile, {
                keysPressed: new Set(),
                mouseButtonsPressed: new Set(),
                mouseDeltaX: 6,
                mouseDeltaY: 0,
                gamepads: []
            })

            expect(state.axes.get(InputAction.LookHorizontal)).toBe(6)
        })
    })
})
