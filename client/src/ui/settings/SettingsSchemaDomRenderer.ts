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
import { isSettingControl, type SectionContent, type SettingsPanelSchema, type SettingsSection } from './SettingsSchema'

export function renderSettingsSchemaSections(schema: SettingsPanelSchema, appSettings: AppSettings): string {
    return schema.sections.map(section => renderSection(section, appSettings)).join('')
}

function renderSection(section: SettingsSection, appSettings: AppSettings): string {
    const heading = section.heading
        ? `<label class="setting-label">${section.heading}</label>`
        : ''
    const description = section.description
        ? `<p class="setting-description">${section.description}</p>`
        : ''
    const content = section.content.map(entry => renderContent(entry, appSettings)).join('')

    return `<section class="setting-section">
        <div class="setting-group">
            ${heading}
            ${description}
            ${content}
        </div>
    </section>`
}

function renderContent(content: SectionContent, appSettings: AppSettings): string {
    if (!isSettingControl(content)) {
        return `<p class="setting-description">${content.text}</p>`
    }

    switch (content.kind) {
        case 'range':
            return new RangeControl({
                id: content.id,
                label: content.label,
                description: content.description,
                min: content.min,
                max: content.max,
                step: content.step,
                value: appSettings.getSetting(content.setting),
                formatDisplay: content.formatDisplay,
                trackLabels: content.trackLabels
            }).render()
    }
}

/** The UIComponentUtils.setupSliders() config that wires every range control in the schema to
 *  live AppSettings writes - the render-time value above and this write-time binding are separate
 *  concerns in this codebase's existing pattern (RangeControl.render() is a pure string). */
export function schemaSliderConfigs(schema: SettingsPanelSchema, appSettings: AppSettings): SliderConfig[] {
    const configs: SliderConfig[] = []
    for (const section of schema.sections) {
        for (const control of section.content) {
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
