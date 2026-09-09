/**
 * The 'display-ui' tab - how sharp and how large the UI itself renders. Was a hand-built uikit
 * panel class (VRDisplayUIPanel) rather than a schema, on the reasoning that one control wasn't
 * worth a schema entry; it grew a second control almost immediately, and having two different ways
 * to define a panel is what made the menus hard to navigate (review feedback, 2026-09-09).
 *
 * No DOM counterpart panel exists for this id yet - these two dials live in the DOM's Graphics
 * panel, which isn't reachable from inside a headset. Being a schema means one can be registered
 * whenever that's wanted, without redefining anything.
 */

import type { SettingsPanelSchema } from '../SettingsSchema'

export const DISPLAY_UI_SCHEMA: SettingsPanelSchema = {
    id: 'display-ui',
    title: 'UI',
    icon: '🖥️',
    group: 'Display',
    resettable: true,
    sections: [
        {
            content: [
                {
                    kind: 'range',
                    setting: 'pixelRatioScale',
                    id: 'pixel-ratio-scale',
                    label: 'Pixel Ratio Scale',
                    description: 'Render resolution multiplier. The real dial for how sharp everything looks.',
                    min: 0.5,
                    max: 2.0,
                    step: 0.05,
                    formatDisplay: v => v.toFixed(2),
                    trackLabels: ['0.5 (soft)', '2.0 (sharp)']
                },
                {
                    kind: 'range',
                    setting: 'uiFontScale',
                    id: 'ui-font-scale',
                    label: 'UI Font Scale',
                    description: 'Scales this menu\'s text, rows and spacing together. Applies live.',
                    min: 0.75,
                    max: 2.0,
                    step: 0.05,
                    formatDisplay: v => `${v.toFixed(2)}×`,
                    trackLabels: ['0.75 (small)', '2.0 (large)']
                }
            ]
        }
    ]
}
