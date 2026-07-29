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

    it('closes on CancelPressed (gamepad B/Circle) when open', () => {
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(true)

        eventManager.emit(InputEventTypes.CancelPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    it('does not open on CancelPressed when already closed - a pure dismiss, not a toggle', () => {
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit(InputEventTypes.CancelPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(false)
    })
})
