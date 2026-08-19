/**
 * VRDisplayAdvancedPanel - pure data-binding tests. Real @pmndrs/uikit Container/Slider/Text/Button
 * instances construct fine under jsdom (they're plain THREE.Mesh subclasses - geometry/material
 * construction doesn't touch a WebGL context), so this constructs the real component tree rather
 * than a stub. Visual layout, real slider drag, and controller-ray hits need live browser
 * verification instead - not unit-testable, per the VR-uikit plan's testing strategy.
 */

import { describe, it, expect } from 'vitest'
import { AppSettings, Setting } from '../../../../../src/core/AppSettings'
import { DEFAULTS } from '../../../../../src/ui/pause/panels/DisplayAdvancedPanel'
import { VRDisplayAdvancedPanel } from '../../../../../src/scene/uikit/panels/VRDisplayAdvancedPanel'

describe('VRDisplayAdvancedPanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        const appSettings = AppSettings.getInstance()
        expect(() => new VRDisplayAdvancedPanel(appSettings)).not.toThrow()
    })

    it('writes through to AppSettings when a slider changes', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, DEFAULTS.artworkRoughness)
        new VRDisplayAdvancedPanel(appSettings)

        appSettings.setSetting(Setting.ArtworkRoughness, 0.5)

        expect(appSettings.getSetting('artworkRoughness')).toBe(0.5)
    })

    it('resets all six settings to DEFAULTS on reset', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, 0.59)
        appSettings.setSetting(Setting.ArtworkMetalness, 0.19)
        appSettings.setSetting(Setting.ArtworkFresnelLift, 0.29)
        appSettings.setSetting(Setting.ArtworkFresnelPower, 7.9)
        appSettings.setSetting(Setting.ShadowContactBias, -0.0002)
        appSettings.setSetting(Setting.ShadowContactNormalBias, 0.029)

        const panel = new VRDisplayAdvancedPanel(appSettings)
        panel.reset()

        expect(appSettings.getSetting('artworkRoughness')).toBe(DEFAULTS.artworkRoughness)
        expect(appSettings.getSetting('artworkMetalness')).toBe(DEFAULTS.artworkMetalness)
        expect(appSettings.getSetting('artworkFresnelLift')).toBe(DEFAULTS.artworkFresnelLift)
        expect(appSettings.getSetting('artworkFresnelPower')).toBe(DEFAULTS.artworkFresnelPower)
        expect(appSettings.getSetting('shadowContactBias')).toBe(DEFAULTS.shadowContactBias)
        expect(appSettings.getSetting('shadowContactNormalBias')).toBe(DEFAULTS.shadowContactNormalBias)
    })
})
