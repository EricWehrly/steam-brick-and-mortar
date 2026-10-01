/**
 * Locks the shipped Display schemas' derived DOM ids and number formats to what they were when each
 * control spelled them out by hand. The ids are load-bearing (DOM element ids the panel tests and
 * slider wiring look up); the formats are what a user reads off the sliders.
 */

import { describe, it, expect } from 'vitest'
import type { RangeSettingControl, SettingsPanelSchema } from '../../../../../src/ui/settings/SettingsSchema'
import { DISPLAY_ADVANCED_SCHEMA } from '../../../../../src/ui/settings/schemas/DisplayAdvancedSchema'
import { DISPLAY_UI_SCHEMA } from '../../../../../src/ui/settings/schemas/DisplayUISchema'

function controlsOf(schema: SettingsPanelSchema): RangeSettingControl[] {
    return schema.sections
        .flatMap(section => section.content)
        .filter((content): content is RangeSettingControl => content.kind === 'range')
}

describe('shipped Display schemas', () => {
    it('keep the DOM ids they had before ids were derived', () => {
        expect(controlsOf(DISPLAY_ADVANCED_SCHEMA).map(control => control.id)).toEqual([
            'artwork-roughness',
            'artwork-metalness',
            'artwork-fresnel-lift',
            'artwork-fresnel-power',
            'shadow-contact-bias',
            'shadow-contact-normal-bias'
        ])
        expect(controlsOf(DISPLAY_UI_SCHEMA).map(control => control.id)).toEqual(['pixel-ratio-scale', 'ui-font-scale'])
    })

    it('keep the number formats they had before formats were derived', () => {
        const formats = Object.fromEntries(
            [...controlsOf(DISPLAY_ADVANCED_SCHEMA), ...controlsOf(DISPLAY_UI_SCHEMA)].map(control => [
                control.setting,
                control.formatDisplay?.(1.5)
            ])
        )

        expect(formats).toEqual({
            artworkRoughness: '1.50',
            artworkMetalness: '1.50',
            artworkFresnelLift: '1.50',
            artworkFresnelPower: '1.5',
            shadowContactBias: '1.5000',
            shadowContactNormalBias: '1.500',
            pixelRatioScale: '1.50',
            uiFontScale: '1.50×'
        })
    })

    it('render a negative bias with its sign, as the hand-written 4-decimal format did', () => {
        const bias = controlsOf(DISPLAY_ADVANCED_SCHEMA).find(control => control.setting === 'shadowContactBias')

        expect(bias?.formatDisplay?.(-0.001)).toBe('-0.0010')
    })
})
