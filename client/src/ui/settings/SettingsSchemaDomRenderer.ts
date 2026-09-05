/**
 * Renders a SettingsSchema to the same DOM shape DisplayAdvancedPanel hand-built before this
 * module existed - one <section class="setting-section"> per SettingsSection, each control
 * rendered via the canonical RangeControl (client/src/ui/components/UIComponent.ts) so schema-
 * driven panels stay visually and behaviorally identical to the ui-normalization-plan's existing
 * control components. schemaSliderConfigs() produces the matching UIComponentUtils wiring config,
 * since RangeControl.render() only returns markup - live event binding is a separate step.
 */

import { RangeControl } from '../components/UIComponent'
import type { SliderConfig } from '../../utils/UIComponentUtils'
import type { AppSettings } from '../../core/AppSettings'
import type { SettingControl, SettingsPanelSchema, SettingsSection } from './SettingsSchema'

export function renderSettingsSchemaSections(schema: SettingsPanelSchema, appSettings: AppSettings): string {
    return schema.sections.map(section => renderSection(section, appSettings)).join('')
}

function renderSection(section: SettingsSection, appSettings: AppSettings): string {
    const description = section.description
        ? `<p class="setting-description">${section.description}</p>`
        : ''
    const controls = section.controls.map(control => renderControl(control, appSettings)).join('')

    return `<section class="setting-section">
        <div class="setting-group">
            <label class="setting-label">${section.heading}</label>
            ${description}
            ${controls}
        </div>
    </section>`
}

function renderControl(control: SettingControl, appSettings: AppSettings): string {
    switch (control.kind) {
        case 'range':
            return new RangeControl({
                id: control.id,
                label: control.label,
                description: control.description,
                min: control.min,
                max: control.max,
                step: control.step,
                value: appSettings.getSetting(control.setting),
                formatDisplay: control.formatDisplay,
                trackLabels: control.trackLabels
            }).render()
    }
}

/** The UIComponentUtils.setupSliders() config that wires every range control in the schema to
 *  live AppSettings writes - the render-time value above and this write-time binding are separate
 *  concerns in this codebase's existing pattern (RangeControl.render() is a pure string). */
export function schemaSliderConfigs(schema: SettingsPanelSchema, appSettings: AppSettings): SliderConfig[] {
    const configs: SliderConfig[] = []
    for (const section of schema.sections) {
        for (const control of section.controls) {
            if (control.kind === 'range') {
                configs.push({
                    sliderId: control.id,
                    valueDisplayId: `${control.id}-value`,
                    formatDisplay: control.formatDisplay,
                    onInput: value => appSettings.setSetting(control.setting, value)
                })
            }
        }
    }
    return configs
}
