/**
 * Builds a whole settings panel from its schema - the VR-side counterpart to
 * SettingsSchemaDomRenderer.ts, and the only thing that turns a schema into uikit geometry. There
 * is deliberately no per-panel class on this side: every tab in the VR menu is this one function
 * applied to a different schema (review feedback, 2026-09-09), so a panel's definition lives in
 * exactly one readable file instead of being split between a data file and a builder class.
 *
 * Layout composition lives here; sizes and colors live in VRMenuStyleSheet.ts; what the panel says
 * and which settings it binds live in the schema. Nothing in this file names a pixel or a hex.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import type { AppSettings } from '../../core/AppSettings'
import {
    isSettingControl,
    schemaSettingKeys,
    type NumericSettingKey,
    type SettingsPanelSchema,
    type SettingsSection
} from '../../ui/settings/SettingsSchema'
import { createSliderRow, type UIKitSliderRow } from './UIKitRowHelpers'
import { toUikitSafeText } from './UikitTextSanitizer'
import { MENU_CLASS } from './VRMenuStyleSheet'

const RESET_LABEL = 'Reset to Defaults'

export interface SettingsSchemaPanel {
    readonly container: Container
    /** Restores every setting this schema binds, then resyncs the displayed rows - the uikit
     *  equivalent of the DOM panel's re-render-after-reset. */
    reset(): void
}

export function buildSettingsPanel(schema: SettingsPanelSchema, appSettings: AppSettings): SettingsSchemaPanel {
    const rowsBySetting = new Map<NumericSettingKey, UIKitSliderRow>()

    const root = new Container(undefined, [MENU_CLASS.panelRoot])
    root.add(new Text({ text: toUikitSafeText(schema.title) }, [MENU_CLASS.panelTitle]))

    for (const section of schema.sections) {
        root.add(buildSection(section, appSettings, rowsBySetting))
    }

    const reset = (): void => {
        appSettings.resetSettingsToDefaults(schemaSettingKeys(schema))
        for (const [setting, row] of rowsBySetting) {
            row.setValue(appSettings.getSetting(setting))
        }
    }

    if (schema.resettable) {
        const resetButton = new Button({ variant: 'secondary', onClick: reset })
        resetButton.add(new Text({ text: RESET_LABEL }, [MENU_CLASS.settingLabel]))
        root.add(resetButton)
    }

    return { container: root, reset }
}

function buildSection(
    section: SettingsSection,
    appSettings: AppSettings,
    rowsBySetting: Map<NumericSettingKey, UIKitSliderRow>
): Container {
    const container = new Container(undefined, [MENU_CLASS.section])

    if (section.heading) {
        container.add(new Text({ text: toUikitSafeText(section.heading) }, [MENU_CLASS.sectionHeading]))
    }
    if (section.description) {
        container.add(new Text({ text: toUikitSafeText(section.description) }, [MENU_CLASS.sectionDescription]))
    }

    for (const content of section.content) {
        if (!isSettingControl(content)) {
            container.add(new Text({ text: toUikitSafeText(content.text) }, [MENU_CLASS.panelNote]))
            continue
        }

        const row = createSliderRow({
            label: content.label,
            description: content.description,
            min: content.min,
            max: content.max,
            step: content.step,
            value: appSettings.getSetting(content.setting),
            formatDisplay: content.formatDisplay,
            onChange: value => appSettings.setSetting(content.setting, value)
        })
        rowsBySetting.set(content.setting, row)
        container.add(row.container)
    }

    return container
}
