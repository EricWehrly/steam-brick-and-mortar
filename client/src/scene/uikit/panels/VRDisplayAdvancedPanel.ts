/**
 * VR port of DisplayAdvancedPanel (client/src/ui/pause/panels/DisplayAdvancedPanel.ts) - built as
 * real @pmndrs/uikit geometry instead of DOM, so it renders inside an actual immersive WebXR
 * session. Both panels render the same DISPLAY_ADVANCED_SCHEMA (SettingsSchema.ts) and read/write
 * the same AppSettings singleton, so they stay in sync automatically and can't drift from each
 * other the way two hand-written copies of the same six controls previously could - see
 * docs/plans/vr-uikit-menu-migration-plan.md.
 *
 * This is one tab's *content* inside VRSettingsMenuShell, not a freestanding panel - the shell's
 * own root owns pixelSize/depthTest/renderOrder/background/border-radius (all inherited uikit
 * properties, so setting them once on the shell covers every tab's content too) and sizes this
 * container's width to fit its content column. This panel only owns its own internal padding/
 * layout and the scroll region it's historically had, unrelated to the shell's chrome.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { AppSettings } from '../../../core/AppSettings'
import { DISPLAY_ADVANCED_SCHEMA, schemaSettingKeys, type NumericSettingKey } from '../../../ui/settings/SettingsSchema'
import { buildSettingsSchemaTree } from '../SettingsSchemaUIKitRenderer'
import type { UIKitSliderRow } from '../UIKitRowHelpers'
import { UIKIT_COLORS } from '../UikitColorTokens'

// Grown from 260/20/14/18 - direct request (2026-08-20): "the 'advanced' is unnecessarily
// squished, too tight, not readable enough." Tall enough now that the 6 controls mostly fit
// without fighting the tab shell's own outer scroll with a second, nested one.
const SCROLL_HEIGHT = 480
const PANEL_PADDING = 28
const ROW_GAP = 20
const TITLE_FONT_SIZE = 20

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
            width: '100%'
        })

        // Plain hyphen, not an em-dash: uikit's msdf glyph lookup had no glyph for "—" (confirmed
        // via repeated "Missing glyph info" console warnings), and the whole title failed to
        // render rather than just that one character.
        root.add(new Text({ text: 'Display - Advanced', fontSize: TITLE_FONT_SIZE, color: UIKIT_COLORS.textPrimary }))

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
        resetButton.add(new Text({ text: 'Reset to Defaults', color: UIKIT_COLORS.textPrimary }))
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
