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

export const DISPLAY_ADVANCED_SCHEMA: SettingsPanelSchema = {
    id: 'display-advanced',
    title: 'Advanced',
    icon: '🔬',
    sections: [
        {
            heading: '🎨 Game Box Artwork Material',
            controls: [
                {
                    kind: 'range',
                    setting: 'artworkRoughness',
                    id: 'artwork-roughness',
                    label: 'Roughness',
                    description: 'Controls how matte vs. glossy the surface reads.',
                    min: 0.2,
                    max: 0.6,
                    step: 0.01,
                    formatDisplay: v => v.toFixed(2),
                    trackLabels: ['0.2 (glossy)', '0.6 (matte)']
                },
                {
                    kind: 'range',
                    setting: 'artworkMetalness',
                    id: 'artwork-metalness',
                    label: 'Metalness',
                    description: 'Adds specular character. Changes apply immediately.',
                    min: 0.0,
                    max: 0.2,
                    step: 0.01,
                    formatDisplay: v => v.toFixed(2),
                    trackLabels: ['0.0 (none)', '0.2 (max)']
                }
            ]
        },
        {
            heading: '✨ Fresnel Edge Lift',
            description: 'Brightens box silhouettes at oblique camera angles so artwork reads at the sides of shelves.',
            controls: [
                {
                    kind: 'range',
                    setting: 'artworkFresnelLift',
                    id: 'artwork-fresnel-lift',
                    label: 'Lift',
                    description: 'Controls brightness boost intensity.',
                    min: 0.0,
                    max: 0.3,
                    step: 0.01,
                    formatDisplay: v => v.toFixed(2),
                    trackLabels: ['0.0 (off)', '0.3 (max)']
                },
                {
                    kind: 'range',
                    setting: 'artworkFresnelPower',
                    id: 'artwork-fresnel-power',
                    label: 'Power',
                    description: 'Controls falloff sharpness.',
                    min: 2.0,
                    max: 8.0,
                    step: 0.1,
                    formatDisplay: v => v.toFixed(1),
                    trackLabels: ['2.0 (wide)', '8.0 (sharp)']
                }
            ]
        },
        {
            heading: '🌓 Shadow Contact Grounding',
            description: 'Controls how tightly shadows hug surfaces at shelf-box intersections.',
            controls: [
                {
                    kind: 'range',
                    setting: 'shadowContactBias',
                    id: 'shadow-contact-bias',
                    label: 'Bias',
                    description: 'More negative pulls shadow contact closer.',
                    min: -0.005,
                    max: -0.0001,
                    step: 0.0001,
                    formatDisplay: v => v.toFixed(4),
                    trackLabels: ['−0.005 (tighter)', '−0.0001 (looser)']
                },
                {
                    kind: 'range',
                    setting: 'shadowContactNormalBias',
                    id: 'shadow-contact-normal-bias',
                    label: 'Normal Bias',
                    description: 'Lower tightens the contact zone. Changes apply immediately.',
                    min: 0.0,
                    max: 0.03,
                    step: 0.001,
                    formatDisplay: v => v.toFixed(3),
                    trackLabels: ['0.0 (tight)', '0.03 (loose)']
                }
            ]
        }
    ]
}
