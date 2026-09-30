/**
 * The 'display-advanced' tab - artwork material, fresnel edge lift, and shadow contact
 * grounding controls. Lives on its own (not inside the generic SettingsSchema.ts) so that file
 * stays framework/tab-agnostic; each tab's schema gets its own file here.
 */

import { range, type SettingsPanelSchema } from '../SettingsSchema'

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
                range('artworkRoughness', {
                    label: 'Roughness',
                    description: 'Controls how matte vs. glossy the surface reads.',
                    min: 0.2,
                    max: 0.6,
                    step: 0.01,
                    trackLabels: ['0.2 (glossy)', '0.6 (matte)']
                }),
                range('artworkMetalness', {
                    label: 'Metalness',
                    description: 'Adds specular character. Changes apply immediately.',
                    min: 0.0,
                    max: 0.2,
                    step: 0.01,
                    trackLabels: ['0.0 (none)', '0.2 (max)']
                })
            ]
        },
        {
            heading: '✨ Fresnel Edge Lift',
            description: 'Brightens box silhouettes at oblique camera angles so artwork reads at the sides of shelves.',
            content: [
                range('artworkFresnelLift', {
                    label: 'Lift',
                    description: 'Controls brightness boost intensity.',
                    min: 0.0,
                    max: 0.3,
                    step: 0.01,
                    trackLabels: ['0.0 (off)', '0.3 (max)']
                }),
                range('artworkFresnelPower', {
                    label: 'Power',
                    description: 'Controls falloff sharpness.',
                    min: 2.0,
                    max: 8.0,
                    step: 0.1,
                    trackLabels: ['2.0 (wide)', '8.0 (sharp)']
                })
            ]
        },
        {
            heading: '🌓 Shadow Contact Grounding',
            description: 'Controls how tightly shadows hug surfaces at shelf-box intersections.',
            content: [
                range('shadowContactBias', {
                    label: 'Bias',
                    description: 'More negative pulls shadow contact closer.',
                    min: -0.005,
                    max: -0.0001,
                    step: 0.0001,
                    trackLabels: ['−0.005 (tighter)', '−0.0001 (looser)']
                }),
                range('shadowContactNormalBias', {
                    label: 'Normal Bias',
                    description: 'Lower tightens the contact zone. Changes apply immediately.',
                    min: 0.0,
                    max: 0.03,
                    step: 0.001,
                    trackLabels: ['0.0 (tight)', '0.03 (loose)']
                })
            ]
        }
    ]
}
