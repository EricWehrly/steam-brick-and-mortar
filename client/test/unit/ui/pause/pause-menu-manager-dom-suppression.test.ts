/**
 * PauseMenuManager - setDomVisualsSuppressed(). Regression coverage for the "VR-only" mode
 * ?forceVRSettingsPanel=1 now drives (see SystemUICoordinator/UrlUtils.isVRSettingsPanelForced()):
 * the DOM overlay's own visibility must stay off, without breaking the open/close state machine
 * MenuPanelChanged sync depends on.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PauseMenuManager } from '../../../../src/ui/pause/PauseMenuManager'
import { EventManager } from '../../../../src/core/EventManager'
import { AppSettings } from '../../../../src/core/AppSettings'
import type { PerformanceMonitorUI } from '../../../../src/ui/PerformanceMonitor'

function getOverlay(): HTMLElement | null {
    return document.getElementById('pause-menu-overlay')
}

describe('PauseMenuManager - DOM visual suppression', () => {
    let manager: PauseMenuManager

    beforeEach(() => {
        document.body.innerHTML = ''
        EventManager.getInstance().removeAllListeners()
        manager = new PauseMenuManager(
            {},
            {},
            undefined,
            EventManager.getInstance(),
            AppSettings.getInstance(),
            {} as unknown as PerformanceMonitorUI
        )
        manager.init()
    })

    afterEach(() => {
        manager.dispose()
    })

    it('shows the DOM overlay on open() by default', () => {
        manager.open()
        expect(getOverlay()?.style.display).toBe('flex')
    })

    it('keeps the DOM overlay hidden on open() when suppressed', () => {
        manager.setDomVisualsSuppressed(true)
        manager.open()

        expect(getOverlay()?.style.display).toBe('none')
        // The state machine still runs underneath - isOpen() and the active panel are real.
        expect(manager.isOpen()).toBe(true)
    })

    it('applies suppression immediately if the menu is already open', () => {
        manager.open()
        expect(getOverlay()?.style.display).toBe('flex')

        manager.setDomVisualsSuppressed(true)
        expect(getOverlay()?.style.display).toBe('none')
    })

    it('un-suppressing while open re-shows the overlay immediately', () => {
        manager.setDomVisualsSuppressed(true)
        manager.open()
        expect(getOverlay()?.style.display).toBe('none')

        manager.setDomVisualsSuppressed(false)
        expect(getOverlay()?.style.display).toBe('flex')
    })
})
