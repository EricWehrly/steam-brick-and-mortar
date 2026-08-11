import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InputActionResolver } from '../../../src/input/InputActionResolver'
import { BindingResolver } from '../../../src/input/BindingResolver'
import { DeviceDetector } from '../../../src/input/DeviceDetector'
import { EventManager } from '../../../src/core/EventManager'
import { InputEventTypes } from '../../../src/types/InteractionEvents'
import { BUILTIN_INPUT_PROFILES, InputProfileId } from '../../../src/input/InputProfile'

function getProfiles(profileId: string) {
    const profile = BUILTIN_INPUT_PROFILES.find(candidate => candidate.id === profileId)
    if (!profile) {
        throw new Error(`Missing profile: ${profileId}`)
    }
    return [profile]
}

function createFakeXRSession(): XRSession {
    return {
        inputSources: [{ handedness: 'right' as XRHandedness, gamepad: { buttons: [], axes: [] } as unknown as Gamepad, profiles: ['generic-trigger'] }],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    } as unknown as XRSession
}

describe('InputActionResolver XR button-press resolution', () => {
    const eventManager = EventManager.getInstance()
    let deviceDetector: DeviceDetector
    let resolver: InputActionResolver
    let interactHandler: ReturnType<typeof vi.fn<(event: CustomEvent) => void>>
    let openMenuHandler: ReturnType<typeof vi.fn<(event: CustomEvent) => void>>

    beforeEach(() => {
        deviceDetector = new DeviceDetector(eventManager)
        deviceDetector.start()
        resolver = new InputActionResolver(new BindingResolver(), deviceDetector, eventManager)
        interactHandler = vi.fn<(event: CustomEvent) => void>()
        openMenuHandler = vi.fn<(event: CustomEvent) => void>()
        eventManager.registerEventHandler(InputEventTypes.InteractPressed, interactHandler)
        eventManager.registerEventHandler(InputEventTypes.OpenMenuPressed, openMenuHandler)
    })

    afterEach(() => {
        eventManager.deregisterEventHandler(InputEventTypes.InteractPressed, interactHandler)
        eventManager.deregisterEventHandler(InputEventTypes.OpenMenuPressed, openMenuHandler)
        resolver.dispose()
        deviceDetector.stop()
    })

    it('emits InteractPressed for an XR trigger (button 0) press, once the VR profile is connected', () => {
        deviceDetector.setXRSession(createFakeXRSession())

        resolver.handleGamepadButtonPress(0, getProfiles(InputProfileId.VR), 'right')

        expect(interactHandler).toHaveBeenCalledTimes(1)
        expect(openMenuHandler).not.toHaveBeenCalled()
    })

    it('emits OpenMenuPressed for the best-effort menu button (index 4)', () => {
        deviceDetector.setXRSession(createFakeXRSession())

        resolver.handleGamepadButtonPress(4, getProfiles(InputProfileId.VR), 'right')

        expect(openMenuHandler).toHaveBeenCalledTimes(1)
        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('does not emit for an XR button with no matching binding', () => {
        deviceDetector.setXRSession(createFakeXRSession())

        resolver.handleGamepadButtonPress(2, getProfiles(InputProfileId.VR), 'right')

        expect(interactHandler).not.toHaveBeenCalled()
        expect(openMenuHandler).not.toHaveBeenCalled()
    })

    it('only resolves against connected profiles - no XR session means no VR device connected', () => {
        resolver.handleGamepadButtonPress(0, getProfiles(InputProfileId.VR), 'right')

        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('a plain (non-XR) button press does not match a handedness-pinned VR binding', () => {
        deviceDetector.setXRSession(createFakeXRSession())

        resolver.handleGamepadButtonPress(0, getProfiles(InputProfileId.VR)) // no handedness - a physical gamepad press

        expect(interactHandler).not.toHaveBeenCalled()
    })
})
