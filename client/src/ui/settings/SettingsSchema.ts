/**
 * Declarative description of a settings panel's controls, consumed by both a DOM renderer
 * (SettingsSchemaDomRenderer.ts) and a VR uikit renderer (scene/uikit/SettingsSchemaUIKitRenderer.ts)
 * so a panel's labels/ranges/formatters/descriptions live in exactly one place instead of being
 * hand-duplicated per surface. Framework-agnostic on purpose - no DOM or THREE imports here.
 *
 * Defaults are deliberately NOT part of this schema: AppSettings.getDefaultSetting()/
 * resetSettingsToDefaults() already own that (see AppSettings.ts's getDefaultSettings()), so a
 * schema-driven reset just passes schemaSettingKeys(schema) through to it rather than carrying a
 * third copy of every default value.
 *
 * Holds only the generic types and helpers - a specific tab's schema data (e.g.
 * DISPLAY_ADVANCED_SCHEMA) lives in its own file under ./schemas/, not here (review feedback,
 * 2026-09-09: "I don't think the schema for a specific tab belongs in here").
 */

import type { ApplicationSettings } from '../../core/AppSettings'

/** Keys of ApplicationSettings whose value is a number - the only settings a range control can
 *  bind to. Distributes over the union so a RangeSettingControl's `setting` field type-checks
 *  directly against AppSettings.setSetting()'s generic signature. */
export type NumericSettingKey = {
    [K in keyof ApplicationSettings]: ApplicationSettings[K] extends number ? K : never
}[keyof ApplicationSettings]

export interface RangeSettingControl {
    readonly kind: 'range'
    readonly setting: NumericSettingKey
    /** DOM element id / uikit row key - must be unique within the panel. */
    readonly id: string
    readonly label: string
    readonly description?: string
    readonly min: number
    readonly max: number
    readonly step: number
    readonly formatDisplay?: (value: number) => string
    /** Labels distributed evenly under the track (e.g. min/max, or named steps). */
    readonly trackLabels?: readonly string[]
}

// Extend with 'toggle' | 'select' variants when a panel actually needs them (Story 5) - see
// docs/plans/vr-uikit-menu-migration-plan.md.
export type SettingControl = RangeSettingControl

export interface SettingsSection {
    readonly heading: string
    /** Rendered once beneath the heading, above the controls - distinct from each control's own
     *  per-control description. */
    readonly description?: string
    readonly controls: readonly SettingControl[]
}

export interface SettingsPanelSchema {
    readonly id: string
    readonly title: string
    readonly icon: string
    readonly sections: readonly SettingsSection[]
}

/** Flattens every control's setting key across every section - the exact input
 *  AppSettings.resetSettingsToDefaults() wants for a schema-driven reset. */
export function schemaSettingKeys(schema: SettingsPanelSchema): ReadonlyArray<keyof ApplicationSettings> {
    return schema.sections.flatMap(section => section.controls.map(control => control.setting))
}
