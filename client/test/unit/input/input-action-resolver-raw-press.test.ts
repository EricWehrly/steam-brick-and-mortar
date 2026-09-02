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

function connectMockGamepad(): void {
    const gamepad = { connected: true, id: 'Test Pad', index: 0 } as unknown as Gamepad
    const event = new Event('gamepadconnected')
    Object.defineProperty(event, 'gamepad', { value: gamepad })
    window.dispatchEvent(event)
}

describe('InputActionResolver raw press resolution', () => {
    const eventManager = EventManager.getInstance()
    let deviceDetector: DeviceDetector
    let resolver: InputActionResolver
    let openMenuHandler: ReturnType<typeof vi.fn<(event: CustomEvent) => void>>
    let interactHandler: ReturnType<typeof vi.fn<(event: CustomEvent) => void>>
    let cancelHandler: ReturnType<typeof vi.fn<(event: CustomEvent) => void>>

    beforeEach(() => {
        deviceDetector = new DeviceDetector(eventManager)
        deviceDetector.start()
        resolver = new InputActionResolver(new BindingResolver(), deviceDetector, eventManager)
        openMenuHandler = vi.fn<(event: CustomEvent) => void>()
        interactHandler = vi.fn<(event: CustomEvent) => void>()
        cancelHandler = vi.fn<(event: CustomEvent) => void>()
        eventManager.registerEventHandler(InputEventTypes.OpenMenuPressed, openMenuHandler)
        eventManager.registerEventHandler(InputEventTypes.InteractPressed, interactHandler)
        eventManager.registerEventHandler(InputEventTypes.CancelPressed, cancelHandler)
    })

    afterEach(() => {
        eventManager.deregisterEventHandler(InputEventTypes.OpenMenuPressed, openMenuHandler)
        eventManager.deregisterEventHandler(InputEventTypes.InteractPressed, interactHandler)
        eventManager.deregisterEventHandler(InputEventTypes.CancelPressed, cancelHandler)
        resolver.dispose()
        deviceDetector.stop()
    })

    it('emits OpenMenuPressed for a raw key bound to OpenMenu', () => {
        resolver.handleRawKeyPress('Escape', getProfiles(InputProfileId.MouseKeyboard))

        expect(openMenuHandler).toHaveBeenCalledTimes(1)
        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('emits InteractPressed for a raw key bound to Interact', () => {
        resolver.handleRawKeyPress('Enter', getProfiles(InputProfileId.MouseKeyboard))

        expect(interactHandler).toHaveBeenCalledTimes(1)
        expect(openMenuHandler).not.toHaveBeenCalled()
    })

    it('does not emit for a keyboard code that only affects an axis action (e.g. movement keys)', () => {
        resolver.handleRawKeyPress('KeyW', getProfiles(InputProfileId.MouseKeyboard))

        expect(openMenuHandler).not.toHaveBeenCalled()
        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('emits InteractPressed for a gamepad button bound to Interact', () => {
        connectMockGamepad()

        resolver.handleGamepadButtonPress(0, getProfiles(InputProfileId.GamepadStandard))

        expect(interactHandler).toHaveBeenCalledTimes(1)
    })

    it('emits OpenMenuPressed for a gamepad button bound to OpenMenu', () => {
        connectMockGamepad()

        resolver.handleGamepadButtonPress(9, getProfiles(InputProfileId.GamepadStandard))

        expect(openMenuHandler).toHaveBeenCalledTimes(1)
    })

    it('emits both OpenMenuPressed and CancelPressed for Escape, so keyboard OpenMenu dismisses other open UI too', () => {
        resolver.handleRawKeyPress('Escape', getProfiles(InputProfileId.MouseKeyboard))

        expect(openMenuHandler).toHaveBeenCalledTimes(1)
        expect(cancelHandler).toHaveBeenCalledTimes(1)
    })

    it('marks Escape\'s CancelPressed as bundledWithOpenMenu - PauseMenuManager uses this to avoid '
        + 'self-cancelling the open its own OpenMenuPressed handler just performed', () => {
        resolver.handleRawKeyPress('Escape', getProfiles(InputProfileId.MouseKeyboard))

        expect(cancelHandler.mock.calls[0][0].detail).toMatchObject({ bundledWithOpenMenu: true })
    })

    it('emits only CancelPressed for gamepad B/Circle (button 1), not OpenMenuPressed, and NOT bundled', () => {
        connectMockGamepad()

        resolver.handleGamepadButtonPress(1, getProfiles(InputProfileId.GamepadStandard))

        expect(cancelHandler).toHaveBeenCalledTimes(1)
        expect(openMenuHandler).not.toHaveBeenCalled()
        expect(cancelHandler.mock.calls[0][0].detail).toMatchObject({ bundledWithOpenMenu: false })
    })

    it('emits both OpenMenuPressed and CancelPressed for gamepad Start (button 9), so opening the menu also dismisses other open UI', () => {
        connectMockGamepad()

        resolver.handleGamepadButtonPress(9, getProfiles(InputProfileId.GamepadStandard))

        expect(openMenuHandler).toHaveBeenCalledTimes(1)
        expect(cancelHandler).toHaveBeenCalledTimes(1)
        expect(cancelHandler.mock.calls[0][0].detail).toMatchObject({ bundledWithOpenMenu: true })
    })

    it('does not emit for a raw press with no matching binding', () => {
        resolver.handleRawKeyPress('KeyZ', getProfiles(InputProfileId.MouseKeyboard))

        expect(openMenuHandler).not.toHaveBeenCalled()
        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('only resolves against connected profiles, not merely enabled ones', () => {
        // GamepadStandard is enabled by default but no gamepad device is connected, so its
        // bindings shouldn't resolve even though the profile itself is enabled.
        resolver.handleGamepadButtonPress(0, getProfiles(InputProfileId.GamepadStandard))

        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('does not emit a specific event for actions with no press-trigger mapping (Sprint, Roll, ...)', () => {
        resolver.handleRawKeyPress('ShiftLeft', getProfiles(InputProfileId.MouseKeyboard))

        expect(openMenuHandler).not.toHaveBeenCalled()
        expect(interactHandler).not.toHaveBeenCalled()
    })

    it('caches the connected-profile set and only refreshes it on DevicesChanged, not every call', () => {
        const scopedDeviceDetector = new DeviceDetector(eventManager)
        const availableDevicesSpy = vi.spyOn(scopedDeviceDetector, 'getAvailableDevices')
        const scopedResolver = new InputActionResolver(new BindingResolver(), scopedDeviceDetector, eventManager)

        const callsAfterConstruction = availableDevicesSpy.mock.calls.length
        expect(callsAfterConstruction).toBeGreaterThan(0)

        scopedResolver.updateFrame(getProfiles(InputProfileId.MouseKeyboard), new Set(), new Set(), 0, 0)
        scopedResolver.updateFrame(getProfiles(InputProfileId.MouseKeyboard), new Set(), new Set(), 0, 0)
        scopedResolver.handleRawKeyPress('Escape', getProfiles(InputProfileId.MouseKeyboard))

        expect(availableDevicesSpy.mock.calls.length).toBe(callsAfterConstruction)

        scopedResolver.dispose()
    })
})
