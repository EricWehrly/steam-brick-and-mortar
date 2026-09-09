/**
 * The 'display-advanced' tab's schema - artwork material, fresnel edge lift, and shadow contact
 * grounding controls. Lives on its own (not inside the generic SettingsSchema.ts) so that file
 * stays framework/tab-agnostic; each tab's schema gets its own file here.
 */

import type { SettingsPanelSchema } from '../SettingsSchema'

export const DISPLAY_ADVANCED_SCHEMA: SettingsPanelSchema = {
    id: 'display-advanced',
    title: 'Advanced',
    icon: '🔬',
    group: 'Display',
    resettable: true,
    sections: [
        {
            heading: '🎨 Game Box Artwork Material',
            content: [
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
            content: [
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
            content: [
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
