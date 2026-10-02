/**
 * The 'graphics-settings' tab - lighting, shadows, anti-aliasing, environment and texture LOD: the
 * DOM Graphics panel's controls that are a plain write to an AppSettings value.
 *
 * Left to the DOM panel until the menu flip, because each needs more than a setting write:
 * the quality preset (applies a whole bundle of settings to the renderer), the ceiling toggle
 * (also raises its own scene event) and fullscreen (browser API). Pixel ratio isn't repeated here;
 * it lives on the Display UI tab.
 */

import { LIGHTING_QUALITY, QUALITY_LEVEL } from '../../../core/AppSettings'
import { range, select, toggle, type SettingsPanelSchema } from '../SettingsSchema'

const SHADOW_QUALITY_LABELS = ['Off', 'Low', 'Medium', 'High', 'Ultra'] as const

const percent = (value: number): string => `${Math.round(value * 100)}%`
const metres = (value: number): string => `${value}m`

export const GRAPHICS_SETTINGS_SCHEMA: SettingsPanelSchema = {
    id: 'graphics-settings',
    title: 'Graphics',
    icon: '🎨',
    resettable: true,
    sections: [
        {
            heading: '💡 Lighting',
            content: [
                toggle('enableLighting', {
                    label: 'Enable lighting',
                    description: 'Toggle lights on and off to compare a lit and an unlit scene.'
                }),
                toggle('showLightingDebug', {
                    label: 'Show red debug shapes',
                    description: 'Visualize where lights should affect the scene.'
                }),
                select('lightingQuality', {
                    label: 'Lighting quality',
                    description: 'Higher quality looks better but costs performance. Applies immediately.',
                    options: [
                        { value: LIGHTING_QUALITY.SIMPLE, label: 'Simple' },
                        { value: LIGHTING_QUALITY.ENHANCED, label: 'Enhanced' },
                        { value: LIGHTING_QUALITY.ADVANCED, label: 'Advanced' },
                        { value: LIGHTING_QUALITY.OUCH_MY_EYES, label: 'Ouch My Eyes' }
                    ]
                }),
                range('environmentIntensity', {
                    label: 'Environment intensity',
                    description: 'Image-based lighting from the room. Lower lets the placed lights dominate; higher brightens reflections.',
                    min: 0,
                    max: 2,
                    step: 0.05
                })
            ]
        },
        {
            heading: '🌓 Shadows',
            content: [
                toggle('shadowMapEnabled', { label: 'Enable shadow maps' }),
                range('shadowQuality', {
                    label: 'Shadow quality',
                    description: 'Improves depth perception but costs processing power. Off disables shadows.',
                    min: 0,
                    max: SHADOW_QUALITY_LABELS.length - 1,
                    step: 1,
                    formatDisplay: level => SHADOW_QUALITY_LABELS[level] ?? SHADOW_QUALITY_LABELS[2]
                }),
                range('ssaoQuality', {
                    label: 'Ambient occlusion (SSAO)',
                    description: 'Contact shadows and crevice darkening. 0 is off; higher levels cost more GPU time.',
                    min: 0,
                    max: 4,
                    step: 1
                })
            ]
        },
        {
            heading: '✨ Anti-aliasing',
            content: [
                select('smaaPreset', {
                    label: 'SMAA',
                    description: 'Post-process edge smoothing; catches every edge type. Independent of MSAA and can stack with it.',
                    options: [
                        { value: QUALITY_LEVEL.LOW, label: 'Low' },
                        { value: QUALITY_LEVEL.MEDIUM, label: 'Medium' },
                        { value: QUALITY_LEVEL.HIGH, label: 'High' },
                        { value: QUALITY_LEVEL.ULTRA, label: 'Ultra' }
                    ]
                }),
                select('msaaLevel', {
                    label: 'MSAA',
                    description: 'Hardware multisampling; only smooths geometry edges and costs more than SMAA, so try SMAA first.',
                    options: [
                        { value: QUALITY_LEVEL.LOW, label: 'Off' },
                        { value: QUALITY_LEVEL.MEDIUM, label: '2x' },
                        { value: QUALITY_LEVEL.HIGH, label: '4x' },
                        { value: QUALITY_LEVEL.ULTRA, label: '8x' }
                    ]
                })
            ]
        },
        {
            heading: '📏 Room',
            content: [
                range('ceilingHeight', {
                    label: 'Ceiling height',
                    description: 'Store ceiling height. Takes effect after a scene reload.',
                    min: 2.5,
                    max: 7,
                    step: 0.1,
                    formatDisplay: metres
                })
            ]
        },
        {
            heading: '🖼️ Texture detail (LOD)',
            description: 'Distance thresholds and texture sizes for game box artwork. The sizes and slot count take effect after a reload.',
            content: [
                range('lodHighDistance', { label: 'HIGH quality within', min: 1, max: 10, step: 0.5, formatDisplay: metres }),
                range('lodMedDistance', { label: 'MED quality within', min: 3, max: 20, step: 0.5, formatDisplay: metres }),
                range('lodMaxHighSlots', { label: 'Max HIGH texture slots', min: 32, max: 512, step: 32 }),
                range('lodHighReductionRatio', { label: 'HIGH texture scale', min: 0.25, max: 1, step: 0.05, formatDisplay: percent }),
                range('lodMedReductionRatio', { label: 'MED texture scale', min: 0.1, max: 0.5, step: 0.05, formatDisplay: percent })
            ]
        }
    ]
}
