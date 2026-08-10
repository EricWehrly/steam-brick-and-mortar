import { describe, expect, it } from 'vitest'
import { BindingResolver, type XRGamepadState } from '../../../src/input/BindingResolver'
import { BUILTIN_INPUT_PROFILES, InputProfileId, InputDeviceKind, type InputProfileDefinition } from '../../../src/input/InputProfile'
import { InputAction } from '../../../src/input/InputActions'

function getProfile(profileId: string): InputProfileDefinition {
    const profile = BUILTIN_INPUT_PROFILES.find(candidate => candidate.id === profileId)
    if (!profile) {
        throw new Error(`Missing profile: ${profileId}`)
    }

    return profile
}

function createXRGamepad(handedness: XRHandedness, buttons: Array<{ pressed: boolean; value: number }>, axes: number[] = []): XRGamepadState {
    return { handedness, gamepad: { buttons, axes } as unknown as Gamepad }
}

const baseRawState = {
    keysPressed: new Set<string>(),
    mouseButtonsPressed: new Set<number>(),
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    gamepads: []
}

describe('BindingResolver xr-component resolution', () => {
    it('resolves Interact (trigger) from a right-hand controller', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('right', [{ pressed: true, value: 1 }])]
        })

        expect(state.buttons.get(InputAction.Interact)).toBe(true)
    })

    it('resolves Interact (trigger) from a left-hand controller too - no handedness pinned', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('left', [{ pressed: true, value: 1 }])]
        })

        expect(state.buttons.get(InputAction.Interact)).toBe(true)
    })

    it('resolves LookHorizontal/LookVertical from thumbstick axes 2/3', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        // Full deflection (±1), not a partial value - resolveXRComponentValue now applies a dead
        // zone (same as gamepad-axis, see BindingResolver's XR_AXIS_DEAD_ZONE), so a partial raw
        // value wouldn't survive unchanged; full deflection still clamps to exactly ±1 either way.
        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('right', [], [0, 0, 1, -1])]
        })

        expect(state.axes.get(InputAction.LookHorizontal)).toBeCloseTo(1)
        expect(state.axes.get(InputAction.LookVertical)).toBeCloseTo(-1)
    })

    it('resolves no interaction when no XR gamepad is connected', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, { ...baseRawState, xrGamepads: [] })

        expect(state.buttons.get(InputAction.Interact)).toBe(false)
    })

    it('resolves no interaction when xrGamepads is omitted entirely', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, baseRawState)

        expect(state.buttons.get(InputAction.Interact)).toBe(false)
    })

    it('a handedness-pinned binding does not resolve from the wrong hand', () => {
        const resolver = new BindingResolver()
        const rightOnlyProfile: InputProfileDefinition = {
            id: InputProfileId.VR,
            name: 'Test',
            deviceKind: InputDeviceKind.VR,
            enabled: true,
            bindings: {
                [InputAction.Interact]: [{ type: 'xr-component', handedness: 'right', componentPath: 'trigger' }]
            }
        }

        const state = resolver.resolve(rightOnlyProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('left', [{ pressed: true, value: 1 }])]
        })

        expect(state.buttons.get(InputAction.Interact)).toBe(false)
    })

    it('an unknown componentPath resolves to 0 without throwing', () => {
        const resolver = new BindingResolver()
        const unknownComponentProfile: InputProfileDefinition = {
            id: InputProfileId.VR,
            name: 'Test',
            deviceKind: InputDeviceKind.VR,
            enabled: true,
            bindings: {
                [InputAction.Interact]: [{ type: 'xr-component', componentPath: 'does-not-exist' }]
            }
        }

        expect(() => resolver.resolve(unknownComponentProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('right', [{ pressed: true, value: 1 }])]
        })).not.toThrow()
    })
})

describe('BindingResolver left-thumbstick movement bindings', () => {
    it('resolves MoveForward/MoveLeft from the left thumbstick, at full deflection', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        // xr-standard axes[2]/[3] = thumbstick x/y. Forward is bound to negative Y (stick up),
        // left is bound to negative X (stick left) - matches the GamepadStandard convention.
        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('left', [], [-1, 0, -1, -1])]
        })

        expect(state.axes.get(InputAction.MoveForward)).toBeCloseTo(1)
        expect(state.axes.get(InputAction.MoveBack)).toBeCloseTo(0)
        expect(state.axes.get(InputAction.MoveLeft)).toBeCloseTo(1)
        expect(state.axes.get(InputAction.MoveRight)).toBeCloseTo(0)
    })

    it('does not resolve movement from the right thumbstick - handedness is pinned to left', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('right', [], [-1, 0, -1, -1])]
        })

        expect(state.axes.get(InputAction.MoveForward)).toBe(0)
        expect(state.axes.get(InputAction.MoveLeft)).toBe(0)
    })

    it('applies a dead zone so small left-thumbstick drift does not creep into movement', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const state = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('left', [], [0, 0, 0, -0.05])]
        })

        expect(state.axes.get(InputAction.MoveForward)).toBe(0)
    })

    it('resolves SprintToggle only from the left thumbstick click (button 3)', () => {
        const resolver = new BindingResolver()
        const vrProfile = getProfile(InputProfileId.VR)

        const leftState = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('left', [{ pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: true, value: 1 }])]
        })
        expect(leftState.buttons.get(InputAction.SprintToggle)).toBe(true)

        const rightState = resolver.resolve(vrProfile, {
            ...baseRawState,
            xrGamepads: [createXRGamepad('right', [{ pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: true, value: 1 }])]
        })
        expect(rightState.buttons.get(InputAction.SprintToggle)).toBe(false)
    })
})

describe('BindingResolver.matchesXRButtonPress', () => {
    it('matches the VR profile Interact binding to trigger (button 0) presses', () => {
        const resolver = new BindingResolver()
        const interactBinding = getProfile(InputProfileId.VR).bindings[InputAction.Interact]![0]

        expect(resolver.matchesXRButtonPress(interactBinding, 'right', 0)).toBe(true)
        expect(resolver.matchesXRButtonPress(interactBinding, 'left', 0)).toBe(true)
        expect(resolver.matchesXRButtonPress(interactBinding, 'right', 1)).toBe(false)
    })

    it('a handedness-pinned binding only matches its own hand', () => {
        const resolver = new BindingResolver()
        const pinnedBinding = { type: 'xr-component' as const, handedness: 'left' as const, componentPath: 'trigger' }

        expect(resolver.matchesXRButtonPress(pinnedBinding, 'left', 0)).toBe(true)
        expect(resolver.matchesXRButtonPress(pinnedBinding, 'right', 0)).toBe(false)
    })

    it('non-xr-component bindings never match', () => {
        const resolver = new BindingResolver()
        const keyboardBinding = { type: 'keyboard-button' as const, code: 'Enter' }

        expect(resolver.matchesXRButtonPress(keyboardBinding, 'right', 0)).toBe(false)
    })

    it('matches the VR profile SprintToggle binding to thumbstick-click (button 3), left hand only', () => {
        const resolver = new BindingResolver()
        const sprintToggleBinding = getProfile(InputProfileId.VR).bindings[InputAction.SprintToggle]![0]

        expect(resolver.matchesXRButtonPress(sprintToggleBinding, 'left', 3)).toBe(true)
        expect(resolver.matchesXRButtonPress(sprintToggleBinding, 'right', 3)).toBe(false)
        expect(resolver.matchesXRButtonPress(sprintToggleBinding, 'left', 0)).toBe(false)
    })
})
