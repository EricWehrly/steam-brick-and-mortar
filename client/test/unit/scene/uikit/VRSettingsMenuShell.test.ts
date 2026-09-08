/**
 * VRSettingsMenuShell - tab switching + MenuPanelChanged sync. Real @pmndrs/uikit Container/Text/
 * Button instances construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts), so this
 * exercises the real tree rather than a stub.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { UIEventTypes, type MenuPanelChangedEvent } from '../../../../src/types/InteractionEvents'
import { VRSettingsMenuShell } from '../../../../src/scene/uikit/VRSettingsMenuShell'
import { VR_MENU_TABS, DEFAULT_VR_MENU_TAB_PANEL_ID } from '../../../../src/scene/uikit/VRMenuTabRegistry'

describe('VRSettingsMenuShell', () => {
    let eventManager: EventManager
    let appSettings: AppSettings

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        appSettings = AppSettings.getInstance()
    })

    it('builds a tab column with one button per registered tab, plus a content area', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)

        expect(shell.container.children).toHaveLength(2)
        const [tabColumn, contentArea] = shell.container.children
        expect(tabColumn.children).toHaveLength(VR_MENU_TABS.length)
        expect(contentArea.children).toHaveLength(1)
    })

    it('starts on the default tab', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        expect(shell.activeTabPanelId).toBe(DEFAULT_VR_MENU_TAB_PANEL_ID)
    })

    it('selectTab() swaps the content area to the chosen tab and emits MenuPanelChanged', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        const otherTab = VR_MENU_TABS[1]

        let received: MenuPanelChangedEvent | null = null
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, e => { received = e.detail })

        shell.selectTab(otherTab.panelId)

        expect(shell.activeTabPanelId).toBe(otherTab.panelId)
        expect(received).toEqual(expect.objectContaining({ panelId: otherTab.panelId }))

        const [, contentArea] = shell.container.children
        expect(contentArea.children).toHaveLength(1)
    })

    it('selectTab() with the already-active tab is a no-op (does not re-emit)', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)

        let emitCount = 0
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, () => { emitCount++ })

        shell.selectTab(DEFAULT_VR_MENU_TAB_PANEL_ID)

        expect(emitCount).toBe(0)
    })

    it('follows an externally-emitted MenuPanelChanged (e.g. from the DOM menu) without re-emitting', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        const otherTab = VR_MENU_TABS[1]

        let emitCount = 0
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, () => { emitCount++ })

        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: otherTab.panelId })

        expect(shell.activeTabPanelId).toBe(otherTab.panelId)
        // The shell's own handler doesn't re-emit - only the test's own emit() above counts.
        expect(emitCount).toBe(1)
    })

    it('ignores a MenuPanelChanged for a panel id with no matching VR tab', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)

        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: 'cache-management' })

        expect(shell.activeTabPanelId).toBe(DEFAULT_VR_MENU_TAB_PANEL_ID)
    })

    it('dispose() stops reacting to MenuPanelChanged', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        shell.dispose()

        const otherTab = VR_MENU_TABS[1]
        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: otherTab.panelId })

        expect(shell.activeTabPanelId).toBe(DEFAULT_VR_MENU_TAB_PANEL_ID)
    })
})
