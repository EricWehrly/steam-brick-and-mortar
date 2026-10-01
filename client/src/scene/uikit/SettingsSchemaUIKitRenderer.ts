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
 * An action button never does its own work: it raises UIEventTypes.SettingsActionRequested (after
 * asking for confirmation first, if its schema says to) and SettingsActionHandler carries it out.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import { computed, type ReadonlySignal } from '@preact/signals-core'
import type { AppSettings } from '../../core/AppSettings'
import type { EventManager } from '../../core/EventManager'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../types/InteractionEvents'
import {
    schemaSettingKeys,
    type ActionContent,
    type SettingsPanelSchema,
    type SettingsSection
} from '../../ui/settings/SettingsSchema'
import { createSliderRow, createToggleRow } from './UIKitRowHelpers'
import { toUikitSafeText } from './UikitTextSanitizer'
import type { ConfirmationRequest } from './VRMenuConfirmDialog'
import { MENU_CLASS } from './VRMenuStyleSheet'

const RESET_LABEL = 'Reset to Defaults'

/** What a panel needs from the surface it's shown on, passed in rather than reached for. */
export interface SettingsPanelContext {
    readonly eventManager: EventManager
    /** Shows a modal and runs `onConfirm` if the user accepts. */
    readonly requestConfirmation: (request: ConfirmationRequest) => void
    /** True while an immersive session is presenting; flatscreen-only actions hide. */
    readonly immersiveSession: ReadonlySignal<boolean>
}

export interface SettingsSchemaPanel {
    readonly container: Container
    /** Restores every setting this schema binds, then resyncs the displayed rows - the uikit
     *  equivalent of the DOM panel's re-render-after-reset. */
    reset(): void
}

export function buildSettingsPanel(
    schema: SettingsPanelSchema,
    appSettings: AppSettings,
    context: SettingsPanelContext
): SettingsSchemaPanel {
    // One closure per setting-bound row, each re-reading its own setting and updating its own row.
    const resyncs: Array<() => void> = []

    const root = new Container(undefined, [MENU_CLASS.panelRoot])
    root.add(new Text({ text: toUikitSafeText(schema.title) }, [MENU_CLASS.panelTitle]))

    for (const section of schema.sections) {
        root.add(buildSection(section, appSettings, context, resyncs))
    }

    const reset = (): void => {
        appSettings.resetSettingsToDefaults(schemaSettingKeys(schema))
        for (const resync of resyncs) {
            resync()
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
    resyncs: Array<() => void>
): Container {
    const container = new Container(undefined, [MENU_CLASS.section])

    if (section.heading) {
        container.add(new Text({ text: toUikitSafeText(section.heading) }, [MENU_CLASS.sectionHeading]))
    }
    if (section.description) {
        container.add(new Text({ text: toUikitSafeText(section.description) }, [MENU_CLASS.sectionDescription]))
    }

    for (const content of section.content) {
        switch (content.kind) {
            case 'note':
                container.add(new Text({ text: toUikitSafeText(content.text) }, [MENU_CLASS.panelNote]))
                break
            case 'range': {
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
                resyncs.push(() => row.setValue(appSettings.getSetting(content.setting)))
                container.add(row.container)
                break
            }
            case 'toggle': {
                const row = createToggleRow({
                    label: content.label,
                    description: content.description,
                    checked: appSettings.getSetting(content.setting),
                    onChange: checked => appSettings.setSetting(content.setting, checked)
                })
                resyncs.push(() => row.setValue(appSettings.getSetting(content.setting)))
                container.add(row.container)
                break
            }
            case 'action':
                container.add(buildAction(content, context))
                break
        }
    }

    return container
}

function buildAction(content: ActionContent, context: SettingsPanelContext): Button {
    const raise = (): void => {
        context.eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId: content.action })
    }
    const press = (): void => {
        if (content.confirm) {
            context.requestConfirmation({ ...content.confirm, onConfirm: raise })
        } else {
            raise()
        }
    }

    const button = new Button(
        {
            variant: 'secondary',
            onClick: press,
            ...(content.flatscreenOnly && {
                display: computed<'none' | 'flex'>(() => (context.immersiveSession.value ? 'none' : 'flex'))
            })
        },
        [MENU_CLASS.action]
    )
    button.add(new Text({ text: toUikitSafeText(content.label) }, [MENU_CLASS.settingLabel]))
    return button
}
