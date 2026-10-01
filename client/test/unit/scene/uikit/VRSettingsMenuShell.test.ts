/**
 * VRSettingsMenuShell - tab switching + MenuPanelChanged sync. Real @pmndrs/uikit Container/Text/
 * Button instances construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts), so this
 * exercises the real tree rather than a stub.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AlertDialog } from '@pmndrs/uikit-default'
import { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { UIEventTypes, WebXREventTypes, type MenuPanelChangedEvent } from '../../../../src/types/InteractionEvents'
import { resolvedProps } from '../../../utils/settings-panel-context'
import { VRSettingsMenuShell } from '../../../../src/scene/uikit/VRSettingsMenuShell'
import { VR_MENU_SCHEMAS, DEFAULT_VR_MENU_TAB_PANEL_ID } from '../../../../src/scene/uikit/VRMenuTabRegistry'

describe('VRSettingsMenuShell', () => {
    let eventManager: EventManager
    let appSettings: AppSettings

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        appSettings = AppSettings.getInstance()
    })

    it('builds a tab column with one button per registered tab, a content area, and the confirmation dialog', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)

        expect(shell.container.children).toHaveLength(3)
        const [tabColumn, contentArea, dialog] = shell.container.children
        expect(dialog).toBeInstanceOf(AlertDialog)
        expect(tabColumn.children).toHaveLength(VR_MENU_SCHEMAS.length)
        expect(contentArea.children).toHaveLength(1)
    })

    it('starts on the default tab', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        expect(shell.activeTabPanelId).toBe(DEFAULT_VR_MENU_TAB_PANEL_ID)
    })

    it('selectTab() swaps the content area to the chosen tab and emits MenuPanelChanged', () => {
        const shell = new VRSettingsMenuShell(eventManager, appSettings)
        const otherTab = VR_MENU_SCHEMAS[1]

        let received: MenuPanelChangedEvent | null = null
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, e => { received = e.detail })

        shell.selectTab(otherTab.id)

        expect(shell.activeTabPanelId).toBe(otherTab.id)
        expect(received).toEqual(expect.objectContaining({ panelId: otherTab.id }))

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
        const otherTab = VR_MENU_SCHEMAS[1]

        let emitCount = 0
        eventManager.registerEventHandler<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, () => { emitCount++ })

        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: otherTab.id })

        expect(shell.activeTabPanelId).toBe(otherTab.id)
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

        const otherTab = VR_MENU_SCHEMAS[1]
        eventManager.emit<MenuPanelChangedEvent>(UIEventTypes.MenuPanelChanged, { panelId: otherTab.id })

        expect(shell.activeTabPanelId).toBe(DEFAULT_VR_MENU_TAB_PANEL_ID)
    })

    describe('actions on the default (Application) tab', () => {
        /** [heading, toggle row, reset, export, import] inside the single section. */
        const actionButtons = (shell: VRSettingsMenuShell) => {
            const contentArea = shell.container.children[1]
            const section = contentArea.children[0].children[1]
            return section.children.slice(2)
        }
        const confirmDialog = (shell: VRSettingsMenuShell) => shell.container.children[2] as AlertDialog
        const press = (button: object) => (resolvedProps(button).onClick as (() => void) | undefined)?.()
        const isHidden = (button: object) => resolvedProps(button).display === 'none'

        it('hides the flatscreen-only actions once an immersive session starts, and shows them when it ends', () => {
            const shell = new VRSettingsMenuShell(eventManager, appSettings)
            const [, exportButton, importButton] = actionButtons(shell)
            expect(isHidden(exportButton)).toBe(false)

            eventManager.emit(WebXREventTypes.SessionStart, {})
            expect(isHidden(exportButton)).toBe(true)
            expect(isHidden(importButton)).toBe(true)

            eventManager.emit(WebXREventTypes.SessionEnd, {})
            expect(isHidden(exportButton)).toBe(false)
        })

        it('opens the confirmation dialog for Reset instead of resetting straight away', () => {
            const shell = new VRSettingsMenuShell(eventManager, appSettings)
            const resetSpy = vi.spyOn(appSettings, 'resetToDefaults')
            const [resetButton] = actionButtons(shell)
            expect(confirmDialog(shell).currentSignal.value).toBeFalsy()

            press(resetButton)

            expect(confirmDialog(shell).currentSignal.value).toBe(true)
            expect(resetSpy).not.toHaveBeenCalled()
        })

        it('abandons a pending confirmation when the user switches tabs', () => {
            const shell = new VRSettingsMenuShell(eventManager, appSettings)
            press(actionButtons(shell)[0])
            expect(confirmDialog(shell).currentSignal.value).toBe(true)

            shell.selectTab(VR_MENU_SCHEMAS[1].id)

            expect(confirmDialog(shell).currentSignal.value).toBe(false)
        })

        it('dispose() stops tracking the immersive session', () => {
            const shell = new VRSettingsMenuShell(eventManager, appSettings)
            const [, exportButton] = actionButtons(shell)
            shell.dispose()

            eventManager.emit(WebXREventTypes.SessionStart, {})

            expect(isHidden(exportButton)).toBe(false)
        })
    })
})
