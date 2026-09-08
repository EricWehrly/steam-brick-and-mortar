/**
 * DisplayAdvancedPanel - first dedicated unit test for this panel. Its render()/attachEvents()/
 * reset are now schema-driven (DISPLAY_ADVANCED_SCHEMA), so this mainly guards that the schema
 * refactor didn't change observable DOM behavior: rendered markup, live slider wiring, and reset.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DisplayAdvancedPanel } from '../../../../../src/ui/pause/panels/DisplayAdvancedPanel'
import { AppSettings, Setting } from '../../../../../src/core/AppSettings'

describe('DisplayAdvancedPanel', () => {
    let appSettings: AppSettings

    beforeEach(() => {
        document.body.innerHTML = '<div id="pause-menu-content"></div>'
        appSettings = AppSettings.getInstance()
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('renders all six schema controls into the DOM', () => {
        const panel = new DisplayAdvancedPanel({}, appSettings)
        panel.init()

        for (const id of ['artwork-roughness', 'artwork-metalness', 'artwork-fresnel-lift', 'artwork-fresnel-power', 'shadow-contact-bias', 'shadow-contact-normal-bias']) {
            expect(document.getElementById(id)).not.toBeNull()
        }
    })

    it('writes a slider input through to AppSettings', () => {
        const panel = new DisplayAdvancedPanel({}, appSettings)
        panel.init()

        const roughnessSlider = document.getElementById('artwork-roughness') as HTMLInputElement
        roughnessSlider.value = '0.5'
        roughnessSlider.dispatchEvent(new Event('input'))

        expect(appSettings.getSetting('artworkRoughness')).toBe(0.5)
    })

    it('resets all six settings to their defaults and re-renders the sliders', () => {
        appSettings.setSetting(Setting.ArtworkRoughness, 0.59)
        appSettings.setSetting(Setting.ArtworkMetalness, 0.19)
        appSettings.setSetting(Setting.ArtworkFresnelLift, 0.29)
        appSettings.setSetting(Setting.ArtworkFresnelPower, 7.9)
        appSettings.setSetting(Setting.ShadowContactBias, -0.0002)
        appSettings.setSetting(Setting.ShadowContactNormalBias, 0.029)

        const panel = new DisplayAdvancedPanel({}, appSettings)
        panel.init()

        const resetButton = document.getElementById('reset-display-advanced') as HTMLButtonElement
        resetButton.click()

        expect(appSettings.getSetting('artworkRoughness')).toBe(appSettings.getDefaultSetting('artworkRoughness'))
        expect(appSettings.getSetting('artworkMetalness')).toBe(appSettings.getDefaultSetting('artworkMetalness'))
        expect(appSettings.getSetting('artworkFresnelLift')).toBe(appSettings.getDefaultSetting('artworkFresnelLift'))
        expect(appSettings.getSetting('artworkFresnelPower')).toBe(appSettings.getDefaultSetting('artworkFresnelPower'))
        expect(appSettings.getSetting('shadowContactBias')).toBe(appSettings.getDefaultSetting('shadowContactBias'))
        expect(appSettings.getSetting('shadowContactNormalBias')).toBe(appSettings.getDefaultSetting('shadowContactNormalBias'))

        const roughnessSlider = document.getElementById('artwork-roughness') as HTMLInputElement
        expect(parseFloat(roughnessSlider.value)).toBeCloseTo(appSettings.getDefaultSetting('artworkRoughness'))
    })

    it('renders section headings and per-control descriptions from the schema', () => {
        const panel = new DisplayAdvancedPanel({}, appSettings)
        panel.init()

        const content = document.getElementById('pause-menu-content')!.innerHTML
        expect(content).toContain('Game Box Artwork Material')
        expect(content).toContain('Controls how matte vs. glossy the surface reads.')
    })
})
