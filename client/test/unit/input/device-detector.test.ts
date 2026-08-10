import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
    isTauriMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
    isTauri: isTauriMock,
}))

import { EventManager } from '../../../src/core/EventManager'
import { DeviceDetector } from '../../../src/input/DeviceDetector'
import { InputEventTypes } from '../../../src/types/InteractionEvents'

function createGamepadEvent(type: string, gamepad: Gamepad): Event {
    const event = new Event(type)
    Object.defineProperty(event, 'gamepad', {
        value: gamepad,
        writable: false
    })
    return event
}

describe('DeviceDetector', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        // Matches the real web build's behavior by default - tests exercising the Tauri-only
        // hardware probe opt in explicitly with isTauriMock.mockReturnValue(true).
        isTauriMock.mockReset().mockReturnValue(false)
        invokeMock.mockReset()
    })

    it('always reports mouse + keyboard', () => {
        const detector = new DeviceDetector(EventManager.getInstance())
        detector.start()

        const devices = detector.getAvailableDevices()
        expect(devices.some(device => device.id === 'mouse-keyboard')).toBe(true)

        detector.stop()
    })

    it('adds touch device after first touch event', () => {
        const detector = new DeviceDetector(EventManager.getInstance())
        detector.start()

        window.dispatchEvent(new Event('touchstart'))

        const devices = detector.getAvailableDevices()
        expect(devices.some(device => device.profileId === 'touch')).toBe(true)

        detector.stop()
    })

    it('tracks gamepad connection and disconnection events', () => {
        const detector = new DeviceDetector(EventManager.getInstance())
        detector.start()

        const gamepad = {
            connected: true,
            id: 'Controller One',
            index: 0,
            mapping: 'standard',
            axes: [],
            buttons: [],
            vibrationActuator: null
        } as unknown as Gamepad

        window.dispatchEvent(createGamepadEvent('gamepadconnected', gamepad))
        expect(detector.getAvailableDevices().some(device => device.id === 'gamepad-0')).toBe(true)

        window.dispatchEvent(createGamepadEvent('gamepaddisconnected', gamepad))
        expect(detector.getAvailableDevices().some(device => device.id === 'gamepad-0')).toBe(false)

        detector.stop()
    })

    it('discovers connected gamepads during polling', () => {
        const detector = new DeviceDetector(EventManager.getInstance())

        const gamepad = {
            connected: true,
            id: 'Polling Pad',
            index: 1,
            mapping: 'standard',
            axes: [],
            buttons: [],
            vibrationActuator: null
        } as unknown as Gamepad

        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [null, gamepad],
            configurable: true
        })

        detector.start()
        detector.pollGamepads()

        const devices = detector.getAvailableDevices()
        expect(devices.some(device => device.id === 'gamepad-1')).toBe(true)

        detector.stop()
    })

    it('emits DevicesChanged when pollGamepads() discovers a newly-connected gamepad', () => {
        const eventManager = EventManager.getInstance()
        const detector = new DeviceDetector(eventManager)
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.DevicesChanged, handler)

        const gamepad = {
            connected: true,
            id: 'Polling Pad',
            index: 2,
            mapping: 'standard',
            axes: [],
            buttons: [],
            vibrationActuator: null
        } as unknown as Gamepad

        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        handler.mockClear()
        detector.pollGamepads()

        expect(handler).toHaveBeenCalled()

        eventManager.deregisterEventHandler(InputEventTypes.DevicesChanged, handler)
        detector.stop()
    })

    it('emits GamepadButtonPressed when a button transitions from released to pressed', () => {
        const eventManager = EventManager.getInstance()
        const detector = new DeviceDetector(eventManager)
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.GamepadButtonPressed, handler)

        const buttons = Array.from({ length: 4 }, () => ({ pressed: false, touched: false, value: 0 }))
        const gamepad = {
            connected: true,
            id: 'Button Pad',
            index: 3,
            mapping: 'standard',
            axes: [],
            buttons,
            vibrationActuator: null
        } as unknown as Gamepad

        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        detector.pollGamepads()
        expect(handler).not.toHaveBeenCalled()

        buttons[1] = { pressed: true, touched: true, value: 1 }
        detector.pollGamepads()

        expect(handler).toHaveBeenCalledTimes(1)
        const event = handler.mock.calls[0][0] as CustomEvent<{ gamepadIndex: number; buttonIndex: number }>
        expect(event.detail).toMatchObject({ gamepadIndex: 3, buttonIndex: 1 })

        eventManager.deregisterEventHandler(InputEventTypes.GamepadButtonPressed, handler)
        detector.stop()
    })

    it('does not re-emit GamepadButtonPressed while a button stays held across polls', () => {
        const eventManager = EventManager.getInstance()
        const detector = new DeviceDetector(eventManager)
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.GamepadButtonPressed, handler)

        const gamepad = {
            connected: true,
            id: 'Held Pad',
            index: 4,
            mapping: 'standard',
            axes: [],
            buttons: [{ pressed: true, touched: true, value: 1 }],
            vibrationActuator: null
        } as unknown as Gamepad

        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        detector.pollGamepads()
        detector.pollGamepads()
        detector.pollGamepads()

        expect(handler).toHaveBeenCalledTimes(1)

        eventManager.deregisterEventHandler(InputEventTypes.GamepadButtonPressed, handler)
        detector.stop()
    })

    describe('hardware probing (desktop only)', () => {
        it('does not invoke any Tauri command on the web build', async () => {
            isTauriMock.mockReturnValue(false)
            const detector = new DeviceDetector(EventManager.getInstance())

            detector.start()
            await vi.waitFor(() => expect(isTauriMock).toHaveBeenCalled())

            expect(invokeMock).not.toHaveBeenCalled()
            detector.stop()
        })

        it('enumerates HID devices on the desktop build', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockResolvedValue([
                { vendor_id: 0x2d40, product_id: 0x00b6, manufacturer: 'PICO', product: 'PICO 4', serial_number: 'ABC123', usage_page: 0x01, usage: 0x05, interface_number: 0 }
            ])

            const detector = new DeviceDetector(EventManager.getInstance())
            detector.start()

            await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith('list_hid_devices'))

            detector.stop()
        })

        it('does not throw when the HID probe fails', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockRejectedValue(new Error('IPC failure'))

            const detector = new DeviceDetector(EventManager.getInstance())
            detector.start()

            await vi.waitFor(() => expect(invokeMock).toHaveBeenCalledWith('list_hid_devices'))

            detector.stop()
        })
    })
})
