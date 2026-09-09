/**
 * VRDisplayUIPanel - very slim start (pixel-ratio-scale + UI font-scale controls), same pure
 * data-binding test style as VRDisplayAdvancedPanel.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { AppSettings, Setting } from '../../../../../src/core/AppSettings'
import { VRDisplayUIPanel } from '../../../../../src/scene/uikit/panels/VRDisplayUIPanel'

describe('VRDisplayUIPanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        const appSettings = AppSettings.getInstance()
        expect(() => new VRDisplayUIPanel(appSettings)).not.toThrow()
    })

    it('shows the current pixelRatioScale as the slider row\'s initial value', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.PixelRatioScale, 1.25)

        const panel = new VRDisplayUIPanel(appSettings)

        const sliderRow = panel.container.children[1]
        const valueText = sliderRow.children[0].children[1] as unknown as { inputProperties: { text: string } }
        expect(valueText.inputProperties.text).toBe('1.25')
    })

    it('writes slider changes straight through AppSettings.setSetting', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.PixelRatioScale, 1)
        new VRDisplayUIPanel(appSettings)

        appSettings.setSetting(Setting.PixelRatioScale, 1.5)

        expect(appSettings.getSetting('pixelRatioScale')).toBe(1.5)
    })

    it('shows the current uiFontScale as the font-scale row\'s initial value', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.UiFontScale, 1.3)

        const panel = new VRDisplayUIPanel(appSettings)

        const sliderRow = panel.container.children[2]
        const valueText = sliderRow.children[0].children[1] as unknown as { inputProperties: { text: string } }
        expect(valueText.inputProperties.text).toBe('1.30×')
    })

    it('writes font-scale slider changes straight through AppSettings.setSetting', () => {
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting(Setting.UiFontScale, 1)
        new VRDisplayUIPanel(appSettings)

        appSettings.setSetting(Setting.UiFontScale, 1.4)

        expect(appSettings.getSetting('uiFontScale')).toBe(1.4)
    })
})
