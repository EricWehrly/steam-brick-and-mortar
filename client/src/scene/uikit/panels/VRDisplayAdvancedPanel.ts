/**
 * VR port of DisplayAdvancedPanel (client/src/ui/pause/panels/DisplayAdvancedPanel.ts) - built as
 * real @pmndrs/uikit geometry instead of DOM, so it renders inside an actual immersive WebXR
 * session. Both panels render the same DISPLAY_ADVANCED_SCHEMA (SettingsSchema.ts) and read/write
 * the same AppSettings singleton, so they stay in sync automatically and can't drift from each
 * other the way two hand-written copies of the same six controls previously could - see
 * docs/plans/vr-uikit-menu-migration-plan.md. This is Phase 1 of the larger DOM -> uikit menu
 * migration (see also docs/plans/css3d-panel-projection-spike.md for why DOM-projection was
 * abandoned first).
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { AppSettings } from '../../../core/AppSettings'
import { DISPLAY_ADVANCED_SCHEMA, schemaSettingKeys, type NumericSettingKey } from '../../../ui/settings/SettingsSchema'
import { buildSettingsSchemaTree } from '../SettingsSchemaUIKitRenderer'
import type { UIKitSliderRow } from '../UIKitRowHelpers'

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

// Without this, the panel sorted into the scene's normal transparent-object depth order - game
// box artwork (also alpha-blended) would render in front of it despite being visually "behind"
// the panel, while opaque shelf geometry (unaffected by transparent sort either way) didn't have
// the problem. The panel represents active UI and should never be occluded by scene content while
// open, so it always wins depth testing and draws after everything else instead of being sorted
// by distance. depthTest/renderOrder are both inherited uikit properties - setting them on the
// root Container is enough for the whole tree.
const ALWAYS_ON_TOP_RENDER_ORDER = 1000

export class VRDisplayAdvancedPanel {
    readonly container: Container
    private readonly rowsBySetting: ReadonlyMap<NumericSettingKey, UIKitSliderRow>

    constructor(private readonly appSettings: AppSettings) {
        const built = this.build()
        this.container = built.container
        this.rowsBySetting = built.rowsBySetting
    }

    private build(): { container: Container; rowsBySetting: ReadonlyMap<NumericSettingKey, UIKitSliderRow> } {
        const root = new Container({
            flexDirection: 'column',
            gap: ROW_GAP,
            padding: PANEL_PADDING,
            width: PANEL_WIDTH,
            pixelSize: PIXEL_SIZE,
            depthTest: false,
            renderOrder: ALWAYS_ON_TOP_RENDER_ORDER,
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
        const { sectionContainers, rowsBySetting } = buildSettingsSchemaTree(DISPLAY_ADVANCED_SCHEMA, this.appSettings)
        for (const section of sectionContainers) {
            scroll.add(section)
        }
        root.add(scroll)

        const resetButton = new Button({ variant: 'secondary', onClick: this.reset.bind(this) })
        resetButton.add(new Text({ text: 'Reset to Defaults', color: '#ffffff' }))
        root.add(resetButton)

        return { container: root, rowsBySetting }
    }

    reset(): void {
        this.appSettings.resetSettingsToDefaults(schemaSettingKeys(DISPLAY_ADVANCED_SCHEMA))

        for (const [setting, row] of this.rowsBySetting) {
            row.setValue(this.appSettings.getSetting(setting))
        }
    }
}
