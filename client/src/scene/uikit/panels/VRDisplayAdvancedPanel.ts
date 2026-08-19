/**
 * VR port of DisplayAdvancedPanel (client/src/ui/pause/panels/DisplayAdvancedPanel.ts) - the same
 * 6 artwork/shadow sliders + reset button, built as real @pmndrs/uikit geometry instead of DOM, so
 * it renders inside an actual immersive WebXR session. Reads/writes the same AppSettings singleton
 * the DOM panel uses, so both UIs stay in sync automatically - this is Phase 1 of the larger
 * DOM -> uikit menu migration (see docs/plans/vr-spatial-settings-menu-plan.md and
 * docs/plans/css3d-panel-projection-spike.md for why DOM-projection was abandoned first).
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { AppSettings, Setting } from '../../../core/AppSettings'
import { DEFAULTS } from '../../../ui/pause/panels/DisplayAdvancedPanel'
import { createSliderRow, type UIKitSliderRow } from '../UIKitRowHelpers'

const PANEL_WIDTH = 500
// Deliberately shorter than the natural content height (6 rows + gaps) so this panel's own
// scroll container is always exercised, not just the tab shell's - see the plan's testing note on
// verifying scroll/click/cursor interaction on the very first pass.
const SCROLL_HEIGHT = 260
const PANEL_PADDING = 20
const ROW_GAP = 14
const TITLE_FONT_SIZE = 18

// uikit's default pixelSize (0.01) converts logical units 1:1 with typical CSS-pixel density,
// which made PANEL_WIDTH=500 render as a literal 5-meter-wide plane - confirmed via live
// debugState() inspection (instance localScale [5, 3.896, 1]) after the panel appeared to not
// render at all: it was actually a giant near-black wall 0.6m from the camera, engulfing the
// whole view. Overriding pixelSize here instead of rescaling every layout constant keeps the
// existing 500/20/14/18 numbers as a normal-feeling UI density; this just controls how large
// that logical density reads in real-world meters. 0.0008 -> ~0.4m wide, ~0.31m tall: a
// comfortable handheld-tablet size at VRSettingsPanelCoordinator's 0.6m viewing distance.
const PIXEL_SIZE = 0.0008

export class VRDisplayAdvancedPanel {
    readonly container: Container
    private readonly rows: Record<keyof typeof DEFAULTS, UIKitSliderRow>

    constructor(private readonly appSettings: AppSettings) {
        const s = appSettings

        this.rows = {
            artworkRoughness: createSliderRow({
                label: 'Roughness', min: 0.2, max: 0.6, step: 0.01,
                value: s.getSetting('artworkRoughness'), formatDisplay: v => v.toFixed(2),
                onChange: v => this.appSettings.setSetting(Setting.ArtworkRoughness, v)
            }),
            artworkMetalness: createSliderRow({
                label: 'Metalness', min: 0.0, max: 0.2, step: 0.01,
                value: s.getSetting('artworkMetalness'), formatDisplay: v => v.toFixed(2),
                onChange: v => this.appSettings.setSetting(Setting.ArtworkMetalness, v)
            }),
            artworkFresnelLift: createSliderRow({
                label: 'Fresnel Lift', min: 0.0, max: 0.3, step: 0.01,
                value: s.getSetting('artworkFresnelLift'), formatDisplay: v => v.toFixed(2),
                onChange: v => this.appSettings.setSetting(Setting.ArtworkFresnelLift, v)
            }),
            artworkFresnelPower: createSliderRow({
                label: 'Fresnel Power', min: 2.0, max: 8.0, step: 0.1,
                value: s.getSetting('artworkFresnelPower'), formatDisplay: v => v.toFixed(1),
                onChange: v => this.appSettings.setSetting(Setting.ArtworkFresnelPower, v)
            }),
            shadowContactBias: createSliderRow({
                label: 'Shadow Bias', min: -0.005, max: -0.0001, step: 0.0001,
                value: s.getSetting('shadowContactBias'), formatDisplay: v => v.toFixed(4),
                onChange: v => this.appSettings.setSetting(Setting.ShadowContactBias, v)
            }),
            shadowContactNormalBias: createSliderRow({
                label: 'Shadow Normal Bias', min: 0.0, max: 0.03, step: 0.001,
                value: s.getSetting('shadowContactNormalBias'), formatDisplay: v => v.toFixed(3),
                onChange: v => this.appSettings.setSetting(Setting.ShadowContactNormalBias, v)
            })
        }

        this.container = this.build()
    }

    private build(): Container {
        const root = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            padding: PANEL_PADDING,
            width: PANEL_WIDTH,
            pixelSize: PIXEL_SIZE,
            backgroundColor: '#1c1c22',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
        })

        // Plain hyphen, not an em-dash: uikit's msdf glyph lookup had no glyph for "—" (confirmed
        // via repeated "Missing glyph info" console warnings), and the whole title failed to
        // render rather than just that one character.
        root.add(new Text({ text: 'Display - Advanced', fontSize: TITLE_FONT_SIZE, color: '#ffffff' }))

        const scroll = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            width: '100%',
            height: SCROLL_HEIGHT,
            overflow: 'scroll'
        })
        for (const row of Object.values(this.rows)) {
            scroll.add(row.container)
        }
        root.add(scroll)

        const resetButton = new Button({ variant: 'secondary', onClick: this.reset.bind(this) })
        resetButton.add(new Text({ text: 'Reset to Defaults', color: '#ffffff' }))
        root.add(resetButton)

        return root
    }

    reset(): void {
        this.appSettings.setSetting(Setting.ArtworkRoughness, DEFAULTS.artworkRoughness)
        this.appSettings.setSetting(Setting.ArtworkMetalness, DEFAULTS.artworkMetalness)
        this.appSettings.setSetting(Setting.ArtworkFresnelLift, DEFAULTS.artworkFresnelLift)
        this.appSettings.setSetting(Setting.ArtworkFresnelPower, DEFAULTS.artworkFresnelPower)
        this.appSettings.setSetting(Setting.ShadowContactBias, DEFAULTS.shadowContactBias)
        this.appSettings.setSetting(Setting.ShadowContactNormalBias, DEFAULTS.shadowContactNormalBias)

        this.rows.artworkRoughness.setValue(DEFAULTS.artworkRoughness)
        this.rows.artworkMetalness.setValue(DEFAULTS.artworkMetalness)
        this.rows.artworkFresnelLift.setValue(DEFAULTS.artworkFresnelLift)
        this.rows.artworkFresnelPower.setValue(DEFAULTS.artworkFresnelPower)
        this.rows.shadowContactBias.setValue(DEFAULTS.shadowContactBias)
        this.rows.shadowContactNormalBias.setValue(DEFAULTS.shadowContactNormalBias)
    }
}
