/**
 * Builds a whole settings panel from its schema - the VR-side counterpart to
 * SettingsSchemaDomRenderer.ts, and the only thing that turns a schema into uikit geometry. There
 * is deliberately no per-panel class on this side: every tab in the VR menu is this one function
 * applied to a different schema (review feedback, 2026-09-09), so a panel's definition lives in
 * exactly one readable file instead of being split between a data file and a builder class.
 *
 * Layout composition lives here; sizes and colors live in styles/vr-menu.css; what the panel says
 * and which settings it binds live in the schema. Nothing in this file names a pixel or a hex.
 *
 * An action button never does its own work: it raises UIEventTypes.SettingsActionRequested, or
 * ConfirmationRequested first when its schema carries a prompt, and the action's owner carries it out.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import type { ReadonlySignal } from '@preact/signals-core'
import type { AppSettings, ApplicationSettings } from '../../core/AppSettings'
import { EventManager } from '../../core/EventManager'
import { UIEventTypes, type ConfirmationRequestedEvent, type SettingsActionRequestedEvent } from '../../types/InteractionEvents'
import {
    isSettingControl,
    schemaSettingKeys,
    type ActionContent,
    type RangeSettingControl,
    type SelectSettingControl,
    type SettingControl,
    type SettingsPanelSchema,
    type SettingsSection,
    type ToggleSettingControl
} from '../../ui/settings/SettingsSchema'
import {
    createActionButton,
    createSelectRow,
    createSliderRow,
    createToggleRow,
    type UIKitSelectRow,
    type UIKitSliderRow,
    type UIKitToggleRow
} from './UIKitRowHelpers'
import { toUikitSafeText } from './UikitTextSanitizer'
import { MENU_CLASS } from './VRMenuStyleSheet'

const RESET_LABEL = 'Reset to Defaults'

/** What a panel needs from the surface it's shown on, passed in rather than reached for. */
export interface SettingsPanelContext {
    /** True while an immersive session is presenting; flatscreen-only actions hide. */
    readonly immersiveSession: ReadonlySignal<boolean>
}

export interface SettingsSchemaPanel {
    readonly container: Container
    /** Restores every setting this schema binds, then resyncs the displayed rows - the uikit
     *  equivalent of the DOM panel's re-render-after-reset. */
    reset(): void
}

/** A setting-bound row and the setting it shows, so reset() can reread one into the other. Each
 *  row's setValue takes only its own setting's type; the method-shorthand member is what lets them
 *  share this one list. */
interface SettingRowBinding {
    readonly setting: keyof ApplicationSettings
    readonly row: { setValue(value: ApplicationSettings[keyof ApplicationSettings]): void }
}

export function buildSettingsPanel(
    schema: SettingsPanelSchema,
    appSettings: AppSettings,
    context: SettingsPanelContext
): SettingsSchemaPanel {
    const bindings: SettingRowBinding[] = []

    const root = new Container(undefined, [MENU_CLASS.panelRoot])
    root.add(new Text({ text: toUikitSafeText(schema.title) }, [MENU_CLASS.panelTitle]))

    for (const section of schema.sections) {
        root.add(buildSection(section, appSettings, context, bindings))
    }

    function reset(): void {
        appSettings.resetSettingsToDefaults(schemaSettingKeys(schema))
        for (const { setting, row } of bindings) {
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
    context: SettingsPanelContext,
    bindings: SettingRowBinding[]
): Container {
    const container = new Container(undefined, [MENU_CLASS.section])

    if (section.heading) {
        container.add(new Text({ text: toUikitSafeText(section.heading) }, [MENU_CLASS.sectionHeading]))
    }
    if (section.description) {
        container.add(new Text({ text: toUikitSafeText(section.description) }, [MENU_CLASS.sectionDescription]))
    }

    for (const content of section.content) {
        if (isSettingControl(content)) {
            const row = buildSettingRow(content, appSettings)
            bindings.push({ setting: content.setting, row })
            container.add(row.container)
        } else if (content.kind === 'action') {
            container.add(buildActionButton(content, context))
        } else {
            container.add(new Text({ text: toUikitSafeText(content.text) }, [MENU_CLASS.panelNote]))
        }
    }

    return container
}

function buildSettingRow(
    control: SettingControl,
    appSettings: AppSettings
): UIKitSliderRow | UIKitToggleRow | UIKitSelectRow {
    switch (control.kind) {
        case 'range':
            return buildSliderRow(control, appSettings)
        case 'toggle':
            return buildToggleRow(control, appSettings)
        case 'select':
            return buildSelectRow(control, appSettings)
    }
}

function buildSliderRow(control: RangeSettingControl, appSettings: AppSettings): UIKitSliderRow {
    function writeSetting(value: number): void {
        appSettings.setSetting(control.setting, value)
    }

    return createSliderRow({
        label: control.label,
        description: control.description,
        min: control.min,
        max: control.max,
        step: control.step,
        value: appSettings.getSetting(control.setting),
        formatDisplay: control.formatDisplay,
        onChange: writeSetting
    })
}

function buildToggleRow(control: ToggleSettingControl, appSettings: AppSettings): UIKitToggleRow {
    function writeSetting(checked: boolean): void {
        appSettings.setSetting(control.setting, checked)
    }

    return createToggleRow({
        label: control.label,
        description: control.description,
        checked: appSettings.getSetting(control.setting),
        onChange: writeSetting
    })
}

function buildSelectRow(control: SelectSettingControl, appSettings: AppSettings): UIKitSelectRow {
    // select() checked each option against the setting's own type; the control erased it to string.
    function writeSetting(value: string): void {
        appSettings.setSetting(control.setting, value as ApplicationSettings[typeof control.setting])
    }

    return createSelectRow({
        label: control.label,
        description: control.description,
        options: control.options,
        value: appSettings.getSetting(control.setting),
        onChange: writeSetting
    })
}

function buildActionButton(content: ActionContent, context: SettingsPanelContext): Button {
    function requestAction(): void {
        const eventManager = EventManager.getInstance()
        if (content.confirm) {
            eventManager.emit<ConfirmationRequestedEvent>(
                UIEventTypes.ConfirmationRequested,
                { actionId: content.action, ...content.confirm }
            )
        } else {
            eventManager.emit<SettingsActionRequestedEvent>(
                UIEventTypes.SettingsActionRequested,
                { actionId: content.action }
            )
        }
    }

    return createActionButton({
        label: content.label,
        onPress: requestAction,
        hidden: content.flatscreenOnly ? context.immersiveSession : undefined
    })
}
