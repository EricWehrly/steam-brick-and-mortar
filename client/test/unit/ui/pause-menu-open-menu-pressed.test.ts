/**
 * PauseMenuManager - OpenMenuPressed wiring
 *
 * Replaces the old hardcoded Escape-only keydown listener: OpenMenu should toggle the pause
 * menu when InputActionResolver decides an OpenMenu press happened, for any device (keyboard
 * Escape, gamepad Start, ...). No actionId/device check needed - the resolver has already done
 * that work by emitting this specific event.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PauseMenuManager } from '../../../src/ui/pause/PauseMenuManager'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { InputEventTypes } from '../../../src/types/InteractionEvents'

describe('PauseMenuManager OpenMenuPressed wiring', () => {
    let pauseMenuManager: PauseMenuManager
    const eventManager = EventManager.getInstance()

    beforeEach(() => {
        document.body.innerHTML = `<div id="app"></div>`

        pauseMenuManager = new PauseMenuManager(
            {},
            {},
            undefined,
            eventManager,
            AppSettings.getInstance(),
            null as unknown as import('../../../src/ui/PerformanceMonitor').PerformanceMonitorUI
        )
        pauseMenuManager.init()
    })

    afterEach(() => {
        pauseMenuManager.dispose()
        document.body.innerHTML = ''
    })

    it('toggles open when OpenMenuPressed fires', () => {
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(true)
    })

    it('toggles closed on a second OpenMenuPressed', () => {
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(true)

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    it('closes on a later, independent CancelPressed (gamepad B/Circle) when open', async () => {
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(true)

        // A real gamepad B/Circle press is a genuinely separate event, sometime after the menu
        // was opened by something else - awaiting a microtask models that gap. Without it, this
        // would be indistinguishable from Escape/Start's own same-keypress OpenMenu+Cancel
        // double-fire (see PauseMenuManager's suppressNextCancelClose), which this test isn't
        // simulating.
        await Promise.resolve()

        eventManager.emit(InputEventTypes.CancelPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    it('does not open on CancelPressed when already closed - a pure dismiss, not a toggle', () => {
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit(InputEventTypes.CancelPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    // Escape (and gamepad Menu/Start) are bound to BOTH OpenMenu and Cancel - InputActionResolver
    // fires every action bound to one physical key from a single press, synchronously and back to
    // back (see InputActionResolver.emitSpecificPressEvents). These two cases are that exact
    // shape: no await between the emits, unlike the gamepad-B/Circle case above.
    it('stays open when OpenMenuPressed and CancelPressed fire from the same keypress while closed', () => {
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        eventManager.emit(InputEventTypes.CancelPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(true)
    })

    it('still closes when OpenMenuPressed and CancelPressed fire from the same keypress while open', () => {
        pauseMenuManager.open()

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        eventManager.emit(InputEventTypes.CancelPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(false)
    })
})
