import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InputManager } from '../../../src/input/InputManager'
import { InputProfileId } from '../../../src/input/InputProfile'
import { EventManager } from '../../../src/core/EventManager'
import { InputEventTypes, UIEventTypes, type MenuOpenEvent, type MenuCloseEvent } from '../../../src/types/InteractionEvents'

function createGamepadWithButtonPressed(buttonIndex: number): Gamepad {
    return {
        connected: true,
        id: 'Test Controller',
        index: 0,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 12 }, (_, index) => ({
            pressed: index === buttonIndex,
            touched: index === buttonIndex,
            value: index === buttonIndex ? 1 : 0
        })),
        vibrationActuator: null
    } as unknown as Gamepad
}

describe('InputManager pause()/resume()', () => {
    let manager: InputManager
    let camera: THREE.PerspectiveCamera

    beforeEach(() => {
        manager = new InputManager({ speed: 0.075 })
        camera = new THREE.PerspectiveCamera()
        manager.startListening()
    })

    it('suspends camera movement application while paused', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))

        manager.pause()
        const positionBefore = camera.position.clone()
        manager.updateCameraMovement(camera)

        expect(camera.position.equals(positionBefore)).toBe(true)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        manager.dispose()
    })

    it('suspends camera rotation application while paused', () => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: 50, movementY: 0 }))
        manager.updateFrame()

        manager.pause()
        const rotationBefore = camera.rotation.y
        manager.updateCameraRotation(camera)

        expect(camera.rotation.y).toBe(rotationBefore)

        document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }))
        manager.dispose()
    })

    it('keyboard OpenMenu still fires while paused - it comes from the raw keydown event, not the per-frame resolver', () => {
        const eventManager = EventManager.getInstance()
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.OpenMenuPressed, handler)

        manager.pause()
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))

        expect(handler).toHaveBeenCalledTimes(1)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' }))
        eventManager.deregisterEventHandler(InputEventTypes.OpenMenuPressed, handler)
        manager.dispose()
    })

    it('gamepad OpenMenu still fires while paused - updateFrame() (which polls gamepads) always runs regardless of pause', () => {
        const eventManager = EventManager.getInstance()
        const handler = vi.fn()
        eventManager.registerEventHandler(InputEventTypes.OpenMenuPressed, handler)

        const gamepad = createGamepadWithButtonPressed(9) // GamepadStandard's OpenMenu binding
        Object.defineProperty(navigator, 'getGamepads', {
            value: () => [gamepad],
            configurable: true
        })
        manager.profileService.setProfileEnabled(InputProfileId.GamepadStandard, true)

        manager.pause()
        manager.updateCameraMovement(camera)

        expect(handler).toHaveBeenCalledTimes(1)

        eventManager.deregisterEventHandler(InputEventTypes.OpenMenuPressed, handler)
        manager.dispose()
    })

    it('resumes applying camera movement after resume()', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))

        manager.pause()
        manager.resume()
        const positionBefore = camera.position.clone()
        manager.updateCameraMovement(camera)

        expect(camera.position.equals(positionBefore)).toBe(false)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        manager.dispose()
    })

    it('isMenuOpen() reflects UIEventTypes.MenuOpen/MenuClose - the shared "is a menu up" check '
        + 'input-adjacent classes (e.g. SceneClickGameBoxRaycast) query instead of tracking their '
        + 'own menu-open state (PR review request, 2026-09-03)', () => {
        const eventManager = EventManager.getInstance()
        expect(manager.isMenuOpen()).toBe(false)

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        expect(manager.isMenuOpen()).toBe(true)

        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        expect(manager.isMenuOpen()).toBe(false)

        manager.dispose()
    })

    it('isMenuOpen() only clears once every open menu has closed - the pause menu and a game box '
        + 'can be open independently', () => {
        const eventManager = EventManager.getInstance()

        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        expect(manager.isMenuOpen()).toBe(true)

        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        expect(manager.isMenuOpen()).toBe(false)

        manager.dispose()
    })
})
