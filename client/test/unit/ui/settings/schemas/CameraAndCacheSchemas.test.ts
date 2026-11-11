/**
 * Camera and Cache schemas: the camera range defaults sit inside their sliders, every preset has a
 * button, and the cache tab's clear action asks for confirmation.
 */

import { describe, it, expect } from 'vitest'
import { AppSettings } from '../../../../../src/core/AppSettings'
import { CAMERA_PRESETS } from '../../../../../src/scene/CameraPresets'
import { cameraPresetActionId, SETTINGS_ACTION } from '../../../../../src/ui/settings/SettingsActions'
import { isSettingControl, type SettingsPanelSchema } from '../../../../../src/ui/settings/SettingsSchema'
import { CACHE_MANAGEMENT_SCHEMA } from '../../../../../src/ui/settings/schemas/CacheManagementSchema'
import { CAMERA_SETTINGS_SCHEMA } from '../../../../../src/ui/settings/schemas/CameraSettingsSchema'

function contentOf(schema: SettingsPanelSchema) {
    return schema.sections.flatMap(section => section.content)
}

describe('CAMERA_SETTINGS_SCHEMA', () => {
    it('keeps each range default inside its own bounds', () => {
        const appSettings = AppSettings.getInstance()
        for (const control of contentOf(CAMERA_SETTINGS_SCHEMA).filter(isSettingControl)) {
            if (control.kind !== 'range') continue
            const fallback = appSettings.getDefaultSetting(control.setting)
            expect(fallback, control.setting).toBeGreaterThanOrEqual(control.min)
            expect(fallback, control.setting).toBeLessThanOrEqual(control.max)
        }
    })

    it('offers one action per camera preset', () => {
        const actions = contentOf(CAMERA_SETTINGS_SCHEMA).flatMap(content => (content.kind === 'action' ? [content.action] : []))

        expect(actions).toEqual(Object.keys(CAMERA_PRESETS).map(key => cameraPresetActionId(key as keyof typeof CAMERA_PRESETS)))
    })
})

describe('CACHE_MANAGEMENT_SCHEMA', () => {
    it('asks for confirmation before clearing', () => {
        const clear = contentOf(CACHE_MANAGEMENT_SCHEMA).find(content => content.kind === 'action' && content.action === SETTINGS_ACTION.ClearCache)

        expect(clear && clear.kind === 'action' && clear.confirm).toBeTruthy()
    })
})
