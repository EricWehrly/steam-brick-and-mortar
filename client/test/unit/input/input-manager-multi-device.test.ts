import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InputManager } from '../../../src/input/InputManager'
import { InputProfileId } from '../../../src/input/InputProfile'
import { InputAction } from '../../../src/input/InputActions'

function createGamepadWithAxes(axes: number[], pressedButtons: ReadonlySet<number> = new Set()): Gamepad {
    return {
        connected: true,
        id: 'Test Controller',
        index: 0,
        mapping: 'standard',
        axes,
        buttons: Array.from({ length: 12 }, (_, index) => ({
            pressed: pressedButtons.has(index),
            touched: pressedButtons.has(index),
            value: pressedButtons.has(index) ? 1 : 0
        })),
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
        manager.updateCameraRotation(camera)
        const afterYaw = camera.rotation.y

        expect(afterYaw).not.toBe(beforeYaw)
        manager.dispose()
    })

    it('translates camera position from gamepad movement axes', () => {
        const manager = new InputManager({ speed: 0.075 })
        const camera = new THREE.PerspectiveCamera()

        const gamepad = createGamepadWithAxes([0, -0.7, 0, 0])
        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        manager.startListening()
        manager.profileService.setProfileEnabled(InputProfileId.GamepadStandard, true)
        manager.updateCameraMovement(camera)

        expect(camera.position.z).toBeLessThan(0)
        manager.dispose()
    })

    it('resolves the gamepad Interact button as pressed through the full input pipeline', () => {
        const manager = new InputManager()

        const gamepad = createGamepadWithAxes([0, 0, 0, 0], new Set([0]))
        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })

        manager.startListening()
        manager.profileService.setProfileEnabled(InputProfileId.GamepadStandard, true)
        manager.updateFrame()

        expect(manager.actionResolver.isActionPressed(InputAction.Interact)).toBe(true)
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
