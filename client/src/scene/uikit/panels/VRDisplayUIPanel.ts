/**
 * VR "Display / UI" tab - very slim start (direct request, 2026-09-05): a real Display/UI tab is
 * still TBD, but the pixel-ratio-scale control needed a place to live *now*, in-headset, since
 * that's the actual dial for text/scene sharpness (see docs/tech-debt.md's now-resolved
 * pixel-ratio-scale bug) and the DOM Graphics panel's slider isn't reachable from inside VR.
 *
 * Pixel Ratio Scale is deliberately NOT AppSettings-schema-driven - one control, not worth a
 * schema entry for. Writes straight through AppSettings.setSetting(), the same call the DOM slider
 * makes - GraphicsSettingsPanel's own AppSettingsEventTypes.Changed subscription (already live;
 * it's constructed unconditionally in PauseMenuManager.registerDefaultPanels()) picks up the
 * change and calls renderer.setPixelRatio() for real, so this panel doesn't need to touch the
 * renderer itself or duplicate that clamping logic. Takes effect live, mid-session.
 *
 * UI Font Scale (direct request, 2026-09-05: "let's add UI font scaling please") multiplies
 * VRSettingsMenuShell's own base pixelSize (resolveShellPixelSize()) - text/rows/gaps across the
 * whole VR menu scale off this one factor together. Unlike Pixel Ratio Scale, this does NOT apply
 * live to an already-open menu: the shell's root pixelSize is set once at construction (long-lived,
 * not rebuilt per tab), and setProperties() on pixelSize alone didn't visibly relayout in testing.
 * Close and reopen the menu (or switch VR sessions) to see the new scale - simplest correct
 * behavior for now; a live-relayout path is real work this slim start doesn't include.
 */

import { Container, Text } from '@pmndrs/uikit'
import { AppSettings } from '../../../core/AppSettings'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'
import { createSliderRow } from '../UIKitRowHelpers'

const PANEL_PADDING = 20
const TITLE_FONT_SIZE = 18
const SECTION_GAP = 16
const PIXEL_RATIO_MIN = 0.5
const PIXEL_RATIO_MAX = 2.0
const PIXEL_RATIO_STEP = 0.05
const FONT_SCALE_MIN = 0.75
const FONT_SCALE_MAX = 2.0
const FONT_SCALE_STEP = 0.05
const HINT_FONT_SIZE = 12
const HINT_COLOR = COLOR_TOKENS.textTertiary

export class VRDisplayUIPanel {
    readonly container: Container

    constructor(private readonly appSettings: AppSettings) {
        const root = new Container({ flexDirection: 'column', gap: SECTION_GAP, padding: PANEL_PADDING, width: '100%' })
        root.add(new Text({ text: 'Display / UI', fontSize: TITLE_FONT_SIZE, color: COLOR_TOKENS.textPrimary }))

        const pixelRatioRow = createSliderRow({
            label: 'Pixel Ratio Scale',
            min: PIXEL_RATIO_MIN,
            max: PIXEL_RATIO_MAX,
            step: PIXEL_RATIO_STEP,
            value: this.appSettings.getSetting('pixelRatioScale'),
            formatDisplay: v => v.toFixed(2),
            onChange: v => this.appSettings.setSetting('pixelRatioScale', v)
        })
        root.add(pixelRatioRow.container)

        const fontScaleRow = createSliderRow({
            label: 'UI Font Scale',
            min: FONT_SCALE_MIN,
            max: FONT_SCALE_MAX,
            step: FONT_SCALE_STEP,
            value: this.appSettings.getSetting('uiFontScale'),
            formatDisplay: v => `${v.toFixed(2)}×`,
            onChange: v => this.appSettings.setSetting('uiFontScale', v)
        })
        root.add(fontScaleRow.container)
        root.add(new Text({
            text: 'Close and reopen the menu to see a new font scale applied.',
            fontSize: HINT_FONT_SIZE,
            color: HINT_COLOR
        }))

        this.container = root
    }
}
