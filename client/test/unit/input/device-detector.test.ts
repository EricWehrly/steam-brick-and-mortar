import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
