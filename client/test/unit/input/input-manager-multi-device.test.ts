import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InputManager } from '../../../src/input/InputManager'
import { InputProfileId } from '../../../src/input/InputProfile'

function createGamepadWithAxes(axes: number[]): Gamepad {
    return {
        connected: true,
        id: 'Test Controller',
        index: 0,
        mapping: 'standard',
        axes,
        buttons: Array.from({ length: 12 }, () => ({ pressed: false, touched: false, value: 0 })),
        vibrationActuator: null
    } as unknown as Gamepad
}

describe('InputManager multi-device behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        localStorage.clear()
    })

    it('uses gamepad look axis when gamepad profile is enabled', () => {
        const manager = new InputManager({ speed: 0.075, mouseSensitivity: 0.005 })
        const camera = new THREE.PerspectiveCamera()

        const gamepad = createGamepadWithAxes([0, 0, 0.7, 0])
        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        manager.startListening()
        manager.profileService.setProfileEnabled(InputProfileId.GamepadStandard, true)
        manager.updateFrame()

        const beforeYaw = camera.rotation.y
        manager.updateCameraRotation(camera, 0)
        const afterYaw = camera.rotation.y

        expect(afterYaw).not.toBe(beforeYaw)
        manager.dispose()
    })

    it('applies sprint multiplier on keyboard movement', () => {
        const manager = new InputManager({ speed: 0.075, sprintMultiplier: 1.5 })
        const cameraNormal = new THREE.PerspectiveCamera()
        const cameraSprint = new THREE.PerspectiveCamera()

        manager.startListening()

        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
        manager.updateCameraMovement(cameraNormal)
        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))

        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
        manager.updateCameraMovement(cameraSprint)
        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }))

        expect(Math.abs(cameraSprint.position.z)).toBeGreaterThan(Math.abs(cameraNormal.position.z))

        manager.dispose()
    })

})
