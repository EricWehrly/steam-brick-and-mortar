/**
 * The 'camera-settings' tab - the main camera's field of view and clipping planes, plus one button
 * per named preset. The DOM panel's multi-camera prev/next stepping has no schema form: it
 * navigates between cameras and only one exists today.
 */

import { CAMERA_PRESETS } from '../../../scene/CameraPresets'
import { preset, range, type SettingsPanelSchema } from '../SettingsSchema'

export const CAMERA_SETTINGS_SCHEMA: SettingsPanelSchema = {
    id: 'camera-settings',
    title: 'Camera',
    icon: '📷',
    sections: [
        {
            heading: 'Presets',
            description: 'Sets field of view and clipping planes together.',
            content: Object.values(CAMERA_PRESETS).map(({ name, fov, near, far }) =>
                preset(name, { cameraFov: fov, cameraNear: near, cameraFar: far })
            )
        },
        {
            heading: 'Projection',
            content: [
                range('cameraFov', {
                    label: 'Field of View (FOV)',
                    description: 'Wider = more peripheral vision. A headset sets its own field of view.',
                    min: 30,
                    max: 120,
                    step: 1,
                    formatDisplay: value => `${value.toFixed(0)}°`
                }),
                range('cameraNear', {
                    label: 'Near Clipping Plane',
                    description: 'Minimum visible distance. Too small (<0.01) causes Z-fighting.',
                    min: 0.01,
                    max: 5,
                    step: 0.01
                }),
                range('cameraFar', {
                    label: 'Far Clipping Plane',
                    description: 'Maximum visible distance. Too large (>5000) reduces depth precision.',
                    min: 100,
                    max: 5000,
                    step: 10
                })
            ]
        }
    ],
    resettable: true
}
