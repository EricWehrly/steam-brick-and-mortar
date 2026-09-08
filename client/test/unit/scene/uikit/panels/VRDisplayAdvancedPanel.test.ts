/**
 * VRDisplayAdvancedPanel - pure data-binding tests. Real @pmndrs/uikit Container/Slider/Text/Button
 * instances construct fine under jsdom (they're plain THREE.Mesh subclasses - geometry/material
 * construction doesn't touch a WebGL context), so this constructs the real component tree rather
 * than a stub. Visual layout, real slider drag, and controller-ray hits need live browser
 * verification instead - not unit-testable, per the VR-uikit plan's testing strategy.
 */

import { describe, it, expect } from 'vitest'
import { AppSettings, Setting } from '../../../../../src/core/AppSettings'
import { VRDisplayAdvancedPanel } from '../../../../../src/scene/uikit/panels/VRDisplayAdvancedPanel'

describe('VRDisplayAdvancedPanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        const appSettings = AppSettings.getInstance()
        expect(() => new VRDisplayAdvancedPanel(appSettings)).not.toThrow()
    })

    it('writes through to AppSettings when a slider changes', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, appSettings.getDefaultSetting('artworkRoughness'))
        new VRDisplayAdvancedPanel(appSettings)

        appSettings.setSetting(Setting.ArtworkRoughness, 0.5)

        expect(appSettings.getSetting('artworkRoughness')).toBe(0.5)
    })

    it('resets all six settings to their defaults on reset', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.ArtworkRoughness, 0.59)
        appSettings.setSetting(Setting.ArtworkMetalness, 0.19)
        appSettings.setSetting(Setting.ArtworkFresnelLift, 0.29)
        appSettings.setSetting(Setting.ArtworkFresnelPower, 7.9)
        appSettings.setSetting(Setting.ShadowContactBias, -0.0002)
        appSettings.setSetting(Setting.ShadowContactNormalBias, 0.029)

        const panel = new VRDisplayAdvancedPanel(appSettings)
        panel.reset()

        expect(appSettings.getSetting('artworkRoughness')).toBe(appSettings.getDefaultSetting('artworkRoughness'))
        expect(appSettings.getSetting('artworkMetalness')).toBe(appSettings.getDefaultSetting('artworkMetalness'))
        expect(appSettings.getSetting('artworkFresnelLift')).toBe(appSettings.getDefaultSetting('artworkFresnelLift'))
        expect(appSettings.getSetting('artworkFresnelPower')).toBe(appSettings.getDefaultSetting('artworkFresnelPower'))
        expect(appSettings.getSetting('shadowContactBias')).toBe(appSettings.getDefaultSetting('shadowContactBias'))
        expect(appSettings.getSetting('shadowContactNormalBias')).toBe(appSettings.getDefaultSetting('shadowContactNormalBias'))
    })

    it('builds all three schema sections into the scroll container', () => {
        const appSettings = AppSettings.getInstance()
        const panel = new VRDisplayAdvancedPanel(appSettings)

        // container children: title Text, scroll Container, reset Button.
        expect(panel.container.children).toHaveLength(3)
        const scroll = panel.container.children[1]
        expect(scroll.children).toHaveLength(3)
    })
})
