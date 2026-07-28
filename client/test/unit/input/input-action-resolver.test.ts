import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BindingResolver } from '../../../src/input/BindingResolver'
import { DeviceDetector, type InputDeviceInfo } from '../../../src/input/DeviceDetector'
import { InputActionResolver } from '../../../src/input/InputActionResolver'
import { BUILTIN_INPUT_PROFILES, InputDeviceKind, InputProfileId } from '../../../src/input/InputProfile'

describe('InputActionResolver', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('only resolves profiles for connected device types', () => {
        const bindingResolverSpy = vi.spyOn(BindingResolver.prototype, 'resolve')
        const detector = new DeviceDetector()
        const resolver = new InputActionResolver(new BindingResolver(), detector)

        vi.spyOn(detector, 'pollGamepads').mockImplementation(() => [])
        vi.spyOn(detector, 'getAvailableDevices').mockReturnValue([
            {
                id: 'mouse-keyboard',
                name: 'Mouse + Keyboard',
                kind: InputDeviceKind.MouseKeyboard,
                connected: true,
                profileId: InputProfileId.MouseKeyboard
            } satisfies InputDeviceInfo
        ])

        resolver.updateFrame(BUILTIN_INPUT_PROFILES, new Set(['KeyW']), new Set())

        expect(bindingResolverSpy).toHaveBeenCalledTimes(1)
        expect(bindingResolverSpy.mock.calls[0]?.[0].id).toBe(InputProfileId.MouseKeyboard)
    })
})