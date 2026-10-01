/**
 * Locks what the Application schema promises - it replaces a hand-written DOM panel, so the id has
 * to match for the two menus to sync, and the behavior the DOM panel had (confirm before reset;
 * export and import being flatscreen-only features) is carried by the schema.
 */

import { describe, it, expect } from 'vitest'
import { APPLICATION_SCHEMA } from '../../../../../src/ui/settings/schemas/ApplicationSchema'
import { SETTINGS_ACTION } from '../../../../../src/ui/settings/SettingsActions'
import type { ActionContent, ToggleSettingControl } from '../../../../../src/ui/settings/SettingsSchema'

const content = APPLICATION_SCHEMA.sections.flatMap(section => section.content)
const actions = content.filter((entry): entry is ActionContent => entry.kind === 'action')
const toggles = content.filter((entry): entry is ToggleSettingControl => entry.kind === 'toggle')

describe('APPLICATION_SCHEMA', () => {
    it('shares the DOM ApplicationPanel\'s id, so the two menus can sync on it', () => {
        expect(APPLICATION_SCHEMA.id).toBe('application')
    })

    it('binds auto-save', () => {
        expect(toggles.map(entry => entry.setting)).toEqual(['autoSave'])
    })

    it('offers reset, export and import', () => {
        expect(actions.map(entry => entry.action)).toEqual([
            SETTINGS_ACTION.ResetAll,
            SETTINGS_ACTION.Export,
            SETTINGS_ACTION.Import
        ])
    })

    it('asks before resetting, since that cannot be undone', () => {
        const reset = actions.find(entry => entry.action === SETTINGS_ACTION.ResetAll)

        expect(reset?.confirm).toMatchObject({ confirmLabel: 'Reset' })
        expect(reset?.flatscreenOnly).toBeUndefined()
    })

    it('keeps export and import flatscreen-only, because they need a download and a file picker', () => {
        const fileActions = actions.filter(entry => entry.action !== SETTINGS_ACTION.ResetAll)

        expect(fileActions).toHaveLength(2)
        expect(fileActions.every(entry => entry.flatscreenOnly === true)).toBe(true)
    })

    it('gives every control an id that is unique within the panel', () => {
        const ids = content.flatMap(entry => (entry.kind === 'note' ? [] : [entry.id]))

        expect(new Set(ids).size).toBe(ids.length)
    })
})
