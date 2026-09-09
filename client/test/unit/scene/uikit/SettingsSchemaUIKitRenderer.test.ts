/**
 * buildSettingsPanel - the one thing that turns a schema into VR menu geometry, so these cover
 * what the deleted per-panel classes used to: that a real uikit tree builds, and that a
 * schema-declared reset restores every setting the schema binds.
 */

import { describe, it, expect } from 'vitest'
import { Container } from '@pmndrs/uikit'
import { AppSettings, Setting } from '../../../../src/core/AppSettings'
import { DISPLAY_ADVANCED_SCHEMA } from '../../../../src/ui/settings/schemas/DisplayAdvancedSchema'
import { DISPLAY_UI_SCHEMA } from '../../../../src/ui/settings/schemas/DisplayUISchema'
import type { SettingsPanelSchema } from '../../../../src/ui/settings/SettingsSchema'
import { buildSettingsPanel } from '../../../../src/scene/uikit/SettingsSchemaUIKitRenderer'

describe('buildSettingsPanel', () => {
    it('builds a real uikit container tree from a schema', () => {
        const panel = buildSettingsPanel(DISPLAY_ADVANCED_SCHEMA, AppSettings.getInstance())

        expect(panel.container).toBeInstanceOf(Container)
        // Title, three sections, and the schema's declared reset action.
        expect(panel.container.children).toHaveLength(5)
    })

    it('omits the reset action for a schema that does not declare one', () => {
        const notResettable: SettingsPanelSchema = { ...DISPLAY_UI_SCHEMA, resettable: false }

        const panel = buildSettingsPanel(notResettable, AppSettings.getInstance())

        // Title + one section, no reset button.
        expect(panel.container.children).toHaveLength(2)
    })

    it('reset() restores every setting the schema binds', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, 0.59)
        appSettings.setSetting(Setting.ShadowContactNormalBias, 0.029)

        buildSettingsPanel(DISPLAY_ADVANCED_SCHEMA, appSettings).reset()

        expect(appSettings.getSetting('artworkRoughness')).toBe(appSettings.getDefaultSetting('artworkRoughness'))
        expect(appSettings.getSetting('shadowContactNormalBias')).toBe(appSettings.getDefaultSetting('shadowContactNormalBias'))
    })

    it('renders a note as content, without binding it to a setting', () => {
        const withNote: SettingsPanelSchema = {
            id: 'noted',
            title: 'Noted',
            icon: '📝',
            sections: [{ content: [{ kind: 'note', text: 'Just an explanation.' }] }]
        }

        const panel = buildSettingsPanel(withNote, AppSettings.getInstance())

        expect(panel.container.children).toHaveLength(2)
        expect(panel.container.children[1].children).toHaveLength(1)
    })
})
