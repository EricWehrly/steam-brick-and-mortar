import * as THREE from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { InputManager } from '../../../src/input/InputManager'
import { EventManager } from '../../../src/core/EventManager'
import { InputEventTypes } from '../../../src/types/InteractionEvents'

describe('InputManager sprint toggle', () => {
    let manager: InputManager
    let camera: THREE.PerspectiveCamera

    beforeEach(() => {
        manager = new InputManager({ speed: 0.075 })
        camera = new THREE.PerspectiveCamera()
        manager.startListening()
    })

    it('SprintTogglePressed makes movement apply the sprint multiplier', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))

        manager.updateCameraMovement(camera)
        const normalDistance = camera.position.length()

        camera.position.set(0, 0, 0)
        EventManager.getInstance().emit(InputEventTypes.SprintTogglePressed, {})
        manager.updateCameraMovement(camera)
        const sprintingDistance = camera.position.length()

        expect(sprintingDistance).toBeGreaterThan(normalDistance)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        manager.dispose()
    })

    it('a second SprintTogglePressed flips sprint back off', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))

        EventManager.getInstance().emit(InputEventTypes.SprintTogglePressed, {})
        manager.updateCameraMovement(camera)
        const sprintingDistance = camera.position.length()

        camera.position.set(0, 0, 0)
        EventManager.getInstance().emit(InputEventTypes.SprintTogglePressed, {})
        manager.updateCameraMovement(camera)
        const normalDistance = camera.position.length()

        expect(normalDistance).toBeLessThan(sprintingDistance)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        manager.dispose()
    })

    it('composes with hold-based Sprint (Shift) - either one active means sprinting', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }))

        manager.updateCameraMovement(camera)
        const shiftHeldDistance = camera.position.length()

        camera.position.set(0, 0, 0)
        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }))
        EventManager.getInstance().emit(InputEventTypes.SprintTogglePressed, {})
        manager.updateCameraMovement(camera)
        const toggledDistance = camera.position.length()

        expect(toggledDistance).toBeCloseTo(shiftHeldDistance)

        document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
        manager.dispose()
    })
})
