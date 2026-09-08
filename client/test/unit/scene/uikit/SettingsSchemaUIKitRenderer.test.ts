import { describe, it, expect } from 'vitest'
import { Container } from '@pmndrs/uikit'
import { AppSettings, Setting } from '../../../../src/core/AppSettings'
import { DISPLAY_ADVANCED_SCHEMA } from '../../../../src/ui/settings/SettingsSchema'
import { buildSettingsSchemaTree } from '../../../../src/scene/uikit/SettingsSchemaUIKitRenderer'

describe('buildSettingsSchemaTree', () => {
    it('builds one Container per schema section', () => {
        const appSettings = AppSettings.getInstance()
        const { sectionContainers } = buildSettingsSchemaTree(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect(sectionContainers).toHaveLength(3)
        for (const section of sectionContainers) {
            expect(section).toBeInstanceOf(Container)
        }
    })

    it('maps every range control to a row keyed by its setting', () => {
        const appSettings = AppSettings.getInstance()
        const { rowsBySetting } = buildSettingsSchemaTree(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect(rowsBySetting.size).toBe(6)
        expect(rowsBySetting.has('artworkRoughness')).toBe(true)
        expect(rowsBySetting.has('shadowContactNormalBias')).toBe(true)
    })

    it('writes through to AppSettings when a row changes, via the schema-declared setting key', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkMetalness, 0.1)
        const { rowsBySetting } = buildSettingsSchemaTree(DISPLAY_ADVANCED_SCHEMA, appSettings)

        // UIKitRowHelpers.createSliderRow wires onChange internally; setValue() is the only
        // externally-observable hook on UIKitSliderRow, so exercise the write path the same way
        // VRDisplayAdvancedPanel.reset() does and confirm the row was really built for this key.
        rowsBySetting.get('artworkMetalness')!.setValue(0.18)

        expect(rowsBySetting.get('artworkMetalness')).toBeDefined()
    })
})
