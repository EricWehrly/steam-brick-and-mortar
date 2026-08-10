import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventManager } from '../../../src/core/EventManager'
import { DeviceDetector } from '../../../src/input/DeviceDetector'
import { InputEventTypes } from '../../../src/types/InteractionEvents'

function createFakeGamepad(buttons: Array<{ pressed: boolean; value: number }>, axes: number[] = []): Gamepad {
    return { buttons, axes } as unknown as Gamepad
}

function createFakeXRSession(inputSources: Array<Partial<XRInputSource>>): XRSession {
    return {
        inputSources,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    } as unknown as XRSession
}

describe('DeviceDetector XR gamepad polling', () => {
    let eventManager: EventManager
    let detector: DeviceDetector

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        detector = new DeviceDetector(eventManager)
    })

    it('returns no XR gamepads when no session is active', () => {
        expect(detector.getXRGamepads()).toEqual([])
        expect(detector.pollXRGamepads()).toEqual([])
    })

    it('returns live gamepad data for each connected controller once a session is set', () => {
        const rightGamepad = createFakeGamepad([{ pressed: false, value: 0 }])
        const leftGamepad = createFakeGamepad([{ pressed: false, value: 0 }])
        detector.setXRSession(createFakeXRSession([
            { handedness: 'right', gamepad: rightGamepad },
            { handedness: 'left', gamepad: leftGamepad }
        ]))

        const xrGamepads = detector.getXRGamepads()
        expect(xrGamepads).toEqual([
            { handedness: 'right', gamepad: rightGamepad },
            { handedness: 'left', gamepad: leftGamepad }
        ])
    })

    it('skips input sources with no gamepad (e.g. hand tracking)', () => {
        detector.setXRSession(createFakeXRSession([{ handedness: 'right', gamepad: null as unknown as Gamepad }]))
        expect(detector.getXRGamepads()).toEqual([])
    })

    it('clears state when the session ends', () => {
        detector.setXRSession(createFakeXRSession([{ handedness: 'right', gamepad: createFakeGamepad([]) }]))
        expect(detector.getXRGamepads()).toHaveLength(1)

        detector.setXRSession(null)
        expect(detector.getXRGamepads()).toEqual([])
    })

    it('emits XRGamepadButtonPressed on a released-to-pressed transition, keyed by handedness', () => {
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)

        const buttons = [{ pressed: false, value: 0 }, { pressed: false, value: 0 }]
        const gamepad = createFakeGamepad(buttons)
        detector.setXRSession(createFakeXRSession([{ handedness: 'right', gamepad }]))

        detector.pollXRGamepads()
        expect(handler).not.toHaveBeenCalled()

        buttons[0] = { pressed: true, value: 1 }
        detector.pollXRGamepads()

        expect(handler).toHaveBeenCalledTimes(1)
        const event = handler.mock.calls[0][0] as CustomEvent<{ handedness: XRHandedness; buttonIndex: number }>
        expect(event.detail).toMatchObject({ handedness: 'right', buttonIndex: 0 })

        eventManager.deregisterEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)
    })

    it('does not re-emit while a button stays held across polls', () => {
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)

        const gamepad = createFakeGamepad([{ pressed: true, value: 1 }])
        detector.setXRSession(createFakeXRSession([{ handedness: 'left', gamepad }]))

        detector.pollXRGamepads()
        detector.pollXRGamepads()
        detector.pollXRGamepads()

        expect(handler).toHaveBeenCalledTimes(1)

        eventManager.deregisterEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)
    })

    it('tracks left and right hands independently', () => {
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)

        const rightButtons = [{ pressed: true, value: 1 }]
        const leftButtons = [{ pressed: false, value: 0 }]
        detector.setXRSession(createFakeXRSession([
            { handedness: 'right', gamepad: createFakeGamepad(rightButtons) },
            { handedness: 'left', gamepad: createFakeGamepad(leftButtons) }
        ]))

        detector.pollXRGamepads()
        expect(handler).toHaveBeenCalledTimes(1)
        expect((handler.mock.calls[0][0] as CustomEvent<{ handedness: XRHandedness }>).detail.handedness).toBe('right')

        eventManager.deregisterEventHandler(InputEventTypes.XRGamepadButtonPressed, handler)
    })
})
