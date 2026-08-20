/**
 * Renders a SettingsSchema to a real @pmndrs/uikit component tree - the VR-side counterpart to
 * SettingsSchemaDomRenderer.ts. One Container per SettingsSection (heading + optional description
 * + rows), each range control built via UIKitRowHelpers.createSliderRow(). Returns the rows keyed
 * by setting so a panel can resync displayed values after a reset without rebuilding the tree.
 */

import { Container, Text } from '@pmndrs/uikit'
import type { AppSettings } from '../../core/AppSettings'
import type { NumericSettingKey, SettingsPanelSchema, SettingsSection } from '../../ui/settings/SettingsSchema'
import { createSliderRow, type UIKitSliderRow } from './UIKitRowHelpers'
import { toUikitSafeText } from './UikitTextSanitizer'

const SECTION_GAP = 10
const SECTION_HEADING_FONT_SIZE = 15
// Matches UIKitRowHelpers' ROW_TEXT_COLOR - kept as its own constant since a section heading
// reads as a step up from row text, not identical styling that happens to share a value.
const HEADING_TEXT_COLOR = '#e8e8ec'
const DESCRIPTION_FONT_SIZE = 12
const DESCRIPTION_TEXT_COLOR = '#9a9aa5'

export interface SettingsSchemaUIKitTree {
    readonly sectionContainers: readonly Container[]
    readonly rowsBySetting: ReadonlyMap<NumericSettingKey, UIKitSliderRow>
}

export function buildSettingsSchemaTree(schema: SettingsPanelSchema, appSettings: AppSettings): SettingsSchemaUIKitTree {
    const rowsBySetting = new Map<NumericSettingKey, UIKitSliderRow>()
    const sectionContainers = schema.sections.map(section => buildSection(section, appSettings, rowsBySetting))
    return { sectionContainers, rowsBySetting }
}

function buildSection(
    section: SettingsSection,
    appSettings: AppSettings,
    rowsBySetting: Map<NumericSettingKey, UIKitSliderRow>
): Container {
    const container = new Container({ flexDirection: 'column', gap: SECTION_GAP, width: '100%' })
    container.add(new Text({ text: toUikitSafeText(section.heading), fontSize: SECTION_HEADING_FONT_SIZE, color: HEADING_TEXT_COLOR }))

    if (section.description) {
        container.add(new Text({ text: toUikitSafeText(section.description), fontSize: DESCRIPTION_FONT_SIZE, color: DESCRIPTION_TEXT_COLOR }))
    }

    for (const control of section.controls) {
        if (control.kind === 'range') {
            const row = createSliderRow({
                label: toUikitSafeText(control.label),
                min: control.min,
                max: control.max,
                step: control.step,
                value: appSettings.getSetting(control.setting),
                formatDisplay: control.formatDisplay,
                onChange: value => appSettings.setSetting(control.setting, value)
            })
            rowsBySetting.set(control.setting, row)
            container.add(row.container)
        }
    }

    return container
}
