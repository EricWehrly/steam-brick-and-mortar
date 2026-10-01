/**
 * buildSettingsPanel - the one thing that turns a schema into VR menu geometry, so these cover
 * what the deleted per-panel classes used to: that a real uikit tree builds, that a schema-declared
 * reset restores every setting the schema binds - and the controls that aren't sliders: toggles
 * bound to a setting, and action buttons that raise an event instead of doing their own work.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Container } from '@pmndrs/uikit'
import { AppSettings, Setting } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../../../src/types/InteractionEvents'
import { DISPLAY_ADVANCED_SCHEMA } from '../../../../src/ui/settings/schemas/DisplayAdvancedSchema'
import { DISPLAY_UI_SCHEMA } from '../../../../src/ui/settings/schemas/DisplayUISchema'
import { APPLICATION_SCHEMA } from '../../../../src/ui/settings/schemas/ApplicationSchema'
import { SETTINGS_ACTION } from '../../../../src/ui/settings/SettingsActions'
import type { SettingsPanelSchema } from '../../../../src/ui/settings/SettingsSchema'
import { buildSettingsPanel } from '../../../../src/scene/uikit/SettingsSchemaUIKitRenderer'
import { createTestPanelContext, resolvedProps } from '../../../utils/settings-panel-context'

/** The Application schema's single section holds: [heading, toggle row, reset, export, import]. */
const SECTION = 1
const HEADING_AND_TOGGLE = 2

describe('buildSettingsPanel', () => {
    it('builds a real uikit container tree from a schema', () => {
        const { context } = createTestPanelContext()
        const panel = buildSettingsPanel(DISPLAY_ADVANCED_SCHEMA, AppSettings.getInstance(), context)

        expect(panel.container).toBeInstanceOf(Container)
        // Title, three sections, and the schema's declared reset action.
        expect(panel.container.children).toHaveLength(5)
    })

    it('omits the reset action for a schema that does not declare one', () => {
        const { context } = createTestPanelContext()
        const notResettable: SettingsPanelSchema = { ...DISPLAY_UI_SCHEMA, resettable: false }

        const panel = buildSettingsPanel(notResettable, AppSettings.getInstance(), context)

        // Title + one section, no reset button.
        expect(panel.container.children).toHaveLength(2)
    })

    it('reset() restores every setting the schema binds', () => {
        const { context } = createTestPanelContext()
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, 0.59)
        appSettings.setSetting(Setting.ShadowContactNormalBias, 0.029)

        buildSettingsPanel(DISPLAY_ADVANCED_SCHEMA, appSettings, context).reset()

        expect(appSettings.getSetting('artworkRoughness')).toBe(appSettings.getDefaultSetting('artworkRoughness'))
        expect(appSettings.getSetting('shadowContactNormalBias')).toBe(appSettings.getDefaultSetting('shadowContactNormalBias'))
    })

    it('renders a note as content, without binding it to a setting', () => {
        const { context } = createTestPanelContext()
        const withNote: SettingsPanelSchema = {
            id: 'noted',
            title: 'Noted',
            icon: '📝',
            sections: [{ content: [{ kind: 'note', text: 'Just an explanation.' }] }]
        }

        const panel = buildSettingsPanel(withNote, AppSettings.getInstance(), context)

        expect(panel.container.children).toHaveLength(2)
        expect(panel.container.children[1].children).toHaveLength(1)
    })

    describe('toggles', () => {
        it('builds a row for a toggle bound to a boolean setting', () => {
            const { context } = createTestPanelContext()
            const panel = buildSettingsPanel(APPLICATION_SCHEMA, AppSettings.getInstance(), context)

            const section = panel.container.children[SECTION]
            // Heading, toggle row, then the three actions.
            expect(section.children).toHaveLength(HEADING_AND_TOGGLE + 3)
            expect(section.children[1]).toBeInstanceOf(Container)
        })

        it('reset() on a schema that binds a toggle restores it too', () => {
            const { context } = createTestPanelContext()
            const appSettings = AppSettings.getInstance()
            const resettable: SettingsPanelSchema = { ...APPLICATION_SCHEMA, resettable: true }
            appSettings.setSetting(Setting.AutoSave, !appSettings.getDefaultSetting('autoSave'))

            buildSettingsPanel(resettable, appSettings, context).reset()

            expect(appSettings.getSetting('autoSave')).toBe(appSettings.getDefaultSetting('autoSave'))
        })
    })

    describe('actions', () => {
        let received: SettingsActionRequestedEvent[]
        const eventManager = EventManager.getInstance()
        const listener = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
            received.push(event.detail)
        }

        beforeEach(() => {
            received = []
            eventManager.registerEventHandler<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, listener)
        })

        afterEach(() => {
            eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, listener)
        })

        /** The Application schema's actions, in order: reset (confirms), export, import. */
        function actionButtons() {
            const harness = createTestPanelContext()
            const panel = buildSettingsPanel(APPLICATION_SCHEMA, AppSettings.getInstance(), harness.context)
            const buttons = panel.container.children[SECTION].children.slice(HEADING_AND_TOGGLE)
            const press = (index: number) => (resolvedProps(buttons[index]).onClick as (() => void) | undefined)?.()
            return { ...harness, buttons, press }
        }

        it('raises the schema-declared action when an action with no confirmation is pressed', () => {
            const { press } = actionButtons()

            press(1)

            expect(received).toEqual([expect.objectContaining({ actionId: SETTINGS_ACTION.Export })])
        })

        it('asks for confirmation instead of acting when the schema says to', () => {
            const { press, confirmations } = actionButtons()

            press(0)

            expect(received).toEqual([])
            expect(confirmations).toHaveLength(1)
            expect(confirmations[0]).toMatchObject({ title: 'Reset all settings?', confirmLabel: 'Reset' })
        })

        it('raises the action only once the user confirms', () => {
            const { press, confirmations } = actionButtons()

            press(0)
            confirmations[0].onConfirm()

            expect(received).toEqual([expect.objectContaining({ actionId: SETTINGS_ACTION.ResetAll })])
        })

        it('hides flatscreen-only actions while an immersive session is presenting, and shows them after', () => {
            const { buttons, immersiveSession } = actionButtons()
            const displayOf = (index: number) => resolvedProps(buttons[index]).display

            expect(displayOf(1)).toBe('flex')
            expect(displayOf(2)).toBe('flex')

            immersiveSession.value = true
            expect(displayOf(1)).toBe('none')
            expect(displayOf(2)).toBe('none')

            immersiveSession.value = false
            expect(displayOf(1)).toBe('flex')
        })

        it('never hides an action that is not flatscreen-only', () => {
            const { buttons, immersiveSession } = actionButtons()
            immersiveSession.value = true

            expect(resolvedProps(buttons[0]).display).not.toBe('none')
        })
    })
})
