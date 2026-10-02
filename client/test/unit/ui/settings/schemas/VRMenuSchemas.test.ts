/**
 * Structural checks on the Game and Graphics schemas: every control id is unique within its
 * panel, every select offers distinct values that the bound setting can actually hold, and every
 * range's default sits inside its slider's bounds.
 */

import { describe, it, expect } from 'vitest'
import { AppSettings } from '../../../../../src/core/AppSettings'
import {
    isSettingControl,
    type SettingsPanelSchema,
    type SettingControl
} from '../../../../../src/ui/settings/SettingsSchema'
import { GAME_SETTINGS_SCHEMA } from '../../../../../src/ui/settings/schemas/GameSettingsSchema'
import { GRAPHICS_SETTINGS_SCHEMA } from '../../../../../src/ui/settings/schemas/GraphicsSettingsSchema'

function controlsOf(schema: SettingsPanelSchema): SettingControl[] {
    return schema.sections.flatMap(section => section.content).filter(isSettingControl)
}

describe.each([GAME_SETTINGS_SCHEMA, GRAPHICS_SETTINGS_SCHEMA])('$id schema', schema => {
    const controls = controlsOf(schema)

    it('has a unique id per control', () => {
        const ids = controls.map(control => control.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('binds each setting at most once', () => {
        const settings = controls.map(control => control.setting)
        expect(new Set(settings).size).toBe(settings.length)
    })

    it('binds only settings whose default has the control\'s own type', () => {
        const appSettings = AppSettings.getInstance()
        const typeByKind = { toggle: 'boolean', range: 'number', select: 'string' } as const
        for (const control of controls) {
            expect(typeof appSettings.getDefaultSetting(control.setting), control.setting).toBe(typeByKind[control.kind])
        }
    })

    it('keeps each range default inside its own bounds', () => {
        const appSettings = AppSettings.getInstance()
        for (const control of controls) {
            if (control.kind !== 'range') {
                continue
            }
            const fallback = appSettings.getDefaultSetting(control.setting)
            expect(fallback, control.setting).toBeGreaterThanOrEqual(control.min)
            expect(fallback, control.setting).toBeLessThanOrEqual(control.max)
        }
    })

    it('offers each select distinct values that include the setting\'s default', () => {
        const appSettings = AppSettings.getInstance()
        for (const control of controls) {
            if (control.kind !== 'select') {
                continue
            }
            const values = control.options.map(option => option.value)
            expect(new Set(values).size, control.setting).toBe(values.length)
            expect(values, control.setting).toContain(appSettings.getDefaultSetting(control.setting))
        }
    })
})
