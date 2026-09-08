import { describe, it, expect } from 'vitest'
import { AppSettings, Setting } from '../../../../src/core/AppSettings'
import { DISPLAY_ADVANCED_SCHEMA } from '../../../../src/ui/settings/SettingsSchema'
import { renderSettingsSchemaSections, schemaSliderConfigs } from '../../../../src/ui/settings/SettingsSchemaDomRenderer'

describe('renderSettingsSchemaSections', () => {
    it('renders one setting-section per schema section, with each control input present', () => {
        const appSettings = AppSettings.getInstance()
        const html = renderSettingsSchemaSections(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect((html.match(/class="setting-section"/g) ?? []).length).toBe(3)
        for (const id of ['artwork-roughness', 'artwork-metalness', 'artwork-fresnel-lift', 'artwork-fresnel-power', 'shadow-contact-bias', 'shadow-contact-normal-bias']) {
            expect(html).toContain(`id="${id}"`)
        }
    })

    it('renders the current AppSettings value into each control, not the schema default', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, 0.55)

        const html = renderSettingsSchemaSections(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect(html).toContain('value="0.55"')
    })

    it('renders a section-level description only when the schema section declares one', () => {
        const appSettings = AppSettings.getInstance()
        const html = renderSettingsSchemaSections(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect(html).toContain('Brightens box silhouettes at oblique camera angles')
        expect(html).toContain('Controls how tightly shadows hug surfaces')
    })
})

describe('schemaSliderConfigs', () => {
    it('produces one UIComponentUtils slider config per range control, wired to AppSettings', () => {
        const appSettings = AppSettings.getInstance()
        const configs = schemaSliderConfigs(DISPLAY_ADVANCED_SCHEMA, appSettings)

        expect(configs).toHaveLength(6)

        const roughnessConfig = configs.find(c => c.sliderId === 'artwork-roughness')!
        roughnessConfig.onInput?.(0.42)

        expect(appSettings.getSetting('artworkRoughness')).toBe(0.42)
    })
})
