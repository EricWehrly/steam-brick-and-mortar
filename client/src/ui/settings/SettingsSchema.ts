/**
 * Declarative description of a whole settings panel - its identity, its copy, and its controls -
 * consumed by both a DOM renderer (SettingsSchemaDomRenderer.ts) and a VR uikit renderer
 * (scene/uikit/SettingsSchemaUIKitRenderer.ts), so a panel lives in exactly one place instead of
 * being hand-duplicated per surface. Framework-agnostic on purpose - no DOM or THREE imports here.
 *
 * A schema is the panel: on the VR side there is no per-panel class to go read, and editing a tab
 * means editing its schema file (review feedback, 2026-09-09: "figuring out how to edit these menus
 * through these files is not at all intuitive"). Layout/appearance is the renderer's and
 * styles/vr-menu.css's business; nothing here carries a size, a color, or a Container.
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
import type { SettingsActionId } from './SettingsActions'

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

export interface RangeOptions {
    readonly label: string
    readonly description?: string
    readonly min: number
    readonly max: number
    readonly step: number
    /** Labels distributed evenly under the track (e.g. min/max, or named steps). */
    readonly trackLabels?: readonly string[]
    /** Appended to the displayed value ('x' for a multiplier). */
    readonly unit?: string
    /** Only for the rare control whose DOM id shouldn't follow its setting key. */
    readonly id?: string
}

/** Builds a range control, deriving what every control would otherwise repeat: `kind`, an `id`
 *  that is the kebab-case of the setting key (`artworkRoughness` -> `artwork-roughness`), and a
 *  display format that shows as many decimals as the step has (step 0.05 -> '1.25', 0.0001 ->
 *  '-0.0010'). Label, description and track labels are real copy and stay explicit. */
export function range(setting: NumericSettingKey, options: RangeOptions): RangeSettingControl {
    const { id, unit = '', ...rest } = options
    const decimals = decimalPlaces(options.step)
    return {
        kind: 'range',
        setting,
        id: id ?? kebabCase(setting),
        formatDisplay: value => `${value.toFixed(decimals)}${unit}`,
        ...rest
    }
}

function kebabCase(camelCase: string): string {
    return camelCase.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function decimalPlaces(step: number): number {
    const [mantissa, exponent] = String(step).split('e-')
    const fractionDigits = mantissa.split('.')[1]?.length ?? 0
    return fractionDigits + (exponent ? Number(exponent) : 0)
}

/** Standalone copy in the flow of a section - an explanation or caveat that belongs between
 *  controls rather than attached to any one of them. Not bound to a setting. */
export interface NoteContent {
    readonly kind: 'note'
    readonly text: string
}

/** Keys of ApplicationSettings whose value is a boolean - what a toggle can bind to. */
export type BooleanSettingKey = {
    [K in keyof ApplicationSettings]: ApplicationSettings[K] extends boolean ? K : never
}[keyof ApplicationSettings]

export interface ToggleSettingControl {
    readonly kind: 'toggle'
    readonly setting: BooleanSettingKey
    /** DOM element id / uikit row key - must be unique within the panel. */
    readonly id: string
    readonly label: string
    readonly description?: string
}

export interface ToggleOptions {
    readonly label: string
    readonly description?: string
    /** Only for the rare control whose DOM id shouldn't follow its setting key. */
    readonly id?: string
}

/** Builds a toggle, deriving `kind` and an `id` that is the kebab-case of the setting key. */
export function toggle(setting: BooleanSettingKey, options: ToggleOptions): ToggleSettingControl {
    const { id, ...rest } = options
    return { kind: 'toggle', setting, id: id ?? kebabCase(setting), ...rest }
}

/** Asks the user to confirm before an action is carried out. Shown as a modal over the menu on
 *  surfaces that can't use a blocking window.confirm() - which is every immersive session. */
export interface ActionConfirmation {
    readonly title: string
    readonly message: string
    readonly confirmLabel: string
}

/** A button that asks the app to do something other than set a setting. Pressing it raises
 *  UIEventTypes.SettingsActionRequested carrying `action`; nothing about how it's carried out lives
 *  in the schema or the renderer. Not bound to a setting. */
export interface ActionContent {
    readonly kind: 'action'
    readonly action: SettingsActionId
    /** DOM element id / uikit row key - must be unique within the panel. */
    readonly id: string
    readonly label: string
    readonly confirm?: ActionConfirmation
    /** Hidden while an immersive session is presenting - for actions that depend on browser UI
     *  (a file picker, a download) that can't be reached from inside a headset. */
    readonly flatscreenOnly?: boolean
}

export interface ActionOptions {
    readonly label: string
    readonly confirm?: ActionConfirmation
    readonly flatscreenOnly?: boolean
    /** Only for a panel that offers the same action twice. */
    readonly id?: string
}

/** Builds an action, deriving `kind` and an `id` that is the action's own id. */
export function action(actionId: SettingsActionId, options: ActionOptions): ActionContent {
    const { id, ...rest } = options
    return { kind: 'action', action: actionId, id: id ?? actionId, ...rest }
}

// Extend with a 'select' variant when a panel actually needs one (Story 5) - see
// docs/plans/vr-uikit-menu-migration-plan.md.
/** A control bound to a setting - what schemaSettingKeys() collects and a schema-driven reset
 *  restores. */
export type SettingControl = RangeSettingControl | ToggleSettingControl

/** Anything a section can contain, in render order. */
export type SectionContent = SettingControl | ActionContent | NoteContent

export interface SettingsSection {
    /** Omitted for a section that's just a run of controls with no heading of its own - a panel
     *  whose title already says everything the heading would. */
    readonly heading?: string
    /** Rendered once beneath the heading, above the controls - distinct from each control's own
     *  per-control description. */
    readonly description?: string
    readonly content: readonly SectionContent[]
}

export interface SettingsPanelSchema {
    readonly id: string
    /** The panel's own name, unqualified ('Advanced'), matching the DOM PauseMenuPanel of the same
     *  id. Surfaces that show panels flat rather than nested (the VR tab row) qualify it with
     *  `group` below rather than declaring a second, drift-prone title. */
    readonly title: string
    readonly icon: string
    /** The DOM pause menu's tab group this panel sits under, if any ('Display'). */
    readonly group?: string
    /** Renders a "Reset to Defaults" action that restores every setting the schema binds. */
    readonly resettable?: boolean
    readonly sections: readonly SettingsSection[]
}

export function isSettingControl(content: SectionContent): content is SettingControl {
    return content.kind === 'range' || content.kind === 'toggle'
}

/** How a flat surface (the VR tab row) names this panel: 'Display · Advanced' rather than a bare
 *  'Advanced' that reads ambiguously next to its siblings. */
export function schemaTabTitle(schema: SettingsPanelSchema): string {
    return schema.group ? `${schema.group} · ${schema.title}` : schema.title
}

/** Flattens every control's setting key across every section - the exact input
 *  AppSettings.resetSettingsToDefaults() wants for a schema-driven reset. */
export function schemaSettingKeys(schema: SettingsPanelSchema): ReadonlyArray<keyof ApplicationSettings> {
    return schema.sections.flatMap(section =>
        section.content.filter(isSettingControl).map(control => control.setting)
    )
}
