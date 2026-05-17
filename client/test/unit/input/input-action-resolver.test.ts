import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BindingResolver } from '../../../src/input/BindingResolver'
import { DeviceDetector, type InputDeviceInfo } from '../../../src/input/DeviceDetector'
import { InputActionResolver } from '../../../src/input/InputActionResolver'
import { BUILTIN_INPUT_PROFILES, InputDeviceKind, InputProfileId } from '../../../src/input/InputProfile'

function createGamepad(): Gamepad {
    return {
        connected: true,
        id: 'Ghost Pad',
        index: 0,
        mapping: 'standard',
        axes: [0, -1, 0, 0],
        buttons: Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null
    } as unknown as Gamepad
}

describe('InputActionResolver', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('only resolves profiles for connected device types', () => {
        const bindingResolverSpy = vi.spyOn(BindingResolver.prototype, 'resolve')
        const detector = new DeviceDetector()
        const resolver = new InputActionResolver(new BindingResolver(), detector)

        vi.spyOn(detector, 'pollGamepads').mockImplementation(() => {})
        vi.spyOn(detector, 'getAvailableDevices').mockReturnValue([
            {
                id: 'mouse-keyboard',
                name: 'Mouse + Keyboard',
                kind: InputDeviceKind.MouseKeyboard,
                connected: true,
                profileId: InputProfileId.MouseKeyboard
            } satisfies InputDeviceInfo
        ])

        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [createGamepad()],
            configurable: true
        })

        resolver.updateFrame(BUILTIN_INPUT_PROFILES, new Set(['KeyW']), new Set())

        expect(bindingResolverSpy).toHaveBeenCalledTimes(1)
        expect(bindingResolverSpy.mock.calls[0]?.[0].id).toBe(InputProfileId.MouseKeyboard)
    })
})