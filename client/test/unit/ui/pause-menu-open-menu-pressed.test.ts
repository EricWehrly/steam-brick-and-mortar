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
import {
    InputEventTypes, UIEventTypes,
    type CancelPressedEvent, type MenuOpenEvent, type MenuCloseEvent
} from '../../../src/types/InteractionEvents'

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

    it('stays open when a Cancel bundled with the same OpenMenu press follows it - Escape/Start '
        + 'bind to both actions, and OpenMenuPressed\'s own toggle() already resolved this press; '
        + 'reacting to the bundled Cancel too self-cancelled the open (direct request, 2026-09-02: '
        + '"the menu is not currently opening when I hit esc")', () => {
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(true)

        eventManager.emit<CancelPressedEvent>(InputEventTypes.CancelPressed, { bundledWithOpenMenu: true })

        expect(pauseMenuManager.isOpen()).toBe(true)
    })

    it('still closes on a bundled Cancel if the menu was already open beforehand - only the '
        + 'open THIS press just performed is protected, not the menu\'s whole prior state', () => {
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        eventManager.emit(InputEventTypes.OpenMenuPressed, {}) // toggled back closed
        eventManager.emit(InputEventTypes.OpenMenuPressed, {}) // open again, by a THIRD press
        expect(pauseMenuManager.isOpen()).toBe(true)

        // A gamepad B/Circle Cancel (never bundled) still closes an already-open menu regardless.
        eventManager.emit<CancelPressedEvent>(InputEventTypes.CancelPressed, { bundledWithOpenMenu: false })

        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    it('does not open while another menuType (e.g. a summoned game box) is up - that Escape press '
        + 'is meant to close the OTHER thing (its own CancelPressed handler), not also pop the '
        + 'settings menu open behind it (direct request, 2026-09-02, round four: "esc to close '
        + 'game box opens settings menu")', () => {
        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(false)
    })

    it('opens on OpenMenuPressed again once the other menuType has closed', () => {
        eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'game-box' })
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(false)

        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'game-box' })
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(true)
    })

    it('still lets an already-open pause menu close via OpenMenuPressed when no other menuType is up', () => {
        eventManager.emit(InputEventTypes.OpenMenuPressed, {})
        expect(pauseMenuManager.isOpen()).toBe(true)

        eventManager.emit(InputEventTypes.OpenMenuPressed, {})

        expect(pauseMenuManager.isOpen()).toBe(false)
    })
})
