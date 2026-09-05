/**
 * PauseMenuManager <-> UIEventTypes.MenuPanelChanged sync - the DOM half of the bidirectional
 * "which settings panel is active" sync with the VR uikit tab shell (VRSettingsMenuShell). See
 * docs/plans/vr-uikit-menu-migration-plan.md's "who owns the active panel" decision.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PauseMenuManager } from '../../../src/ui/pause/PauseMenuManager'
import { CacheManagementPanel } from '../../../src/ui/pause/panels/CacheManagementPanel'
import { ApplicationPanel } from '../../../src/ui/pause/panels/ApplicationPanel'
import { EventManager } from '../../../src/core/EventManager'
import { AppSettings } from '../../../src/core/AppSettings'
import { UIEventTypes, type MenuPanelChangedEvent } from '../../../src/types/InteractionEvents'

describe('PauseMenuManager MenuPanelChanged sync', () => {
    let pauseMenuManager: PauseMenuManager
    let eventManager: EventManager

    beforeEach(() => {
        document.body.innerHTML = `<div id="app"></div>`

        eventManager = EventManager.getInstance()
        const appSettings = AppSettings.getInstance()

        pauseMenuManager = new PauseMenuManager(
            {},
            { performanceMonitor: null as any, renderer: null as any },
            eventManager,
            appSettings,
            null as any
        )
        pauseMenuManager.init()
        pauseMenuManager.registerPanel(new CacheManagementPanel())
        pauseMenuManager.registerPanel(new ApplicationPanel({}, appSettings, eventManager))
    })

    afterEach(() => {
        pauseMenuManager.dispose()
        document.body.innerHTML = ''
    })

    it('emits MenuPanelChanged when showPanel() actually changes the active panel', () => {
        const handler = vi.fn()
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, handler)

        pauseMenuManager.open('cache-management')

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0][0].detail).toEqual(expect.objectContaining({ panelId: 'cache-management' }))
    })

    it('does not re-emit MenuPanelChanged when showPanel() is called with the already-active panel', () => {
        pauseMenuManager.open('cache-management')

        const handler = vi.fn()
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, handler)

        pauseMenuManager.showPanel('cache-management')

        expect(handler).not.toHaveBeenCalled()
    })

    it('switches its own active panel in response to an externally-emitted MenuPanelChanged', () => {
        pauseMenuManager.open('cache-management')
        expect(pauseMenuManager.getState().activePanel).toBe('cache-management')

        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'application' })

        expect(pauseMenuManager.getState().activePanel).toBe('application')
    })

    it('ignores an externally-emitted MenuPanelChanged for a panel id it does not have', () => {
        pauseMenuManager.open('cache-management')

        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'vr-more-settings' })

        expect(pauseMenuManager.getState().activePanel).toBe('cache-management')
    })

    it('dispose() stops reacting to MenuPanelChanged', () => {
        pauseMenuManager.open('cache-management')
        pauseMenuManager.dispose()

        expect(() => eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'application' })).not.toThrow()
    })
})
