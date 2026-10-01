import { describe, it, expect } from 'vitest'
import { action, range, schemaSettingKeys, schemaTabTitle, toggle, type SettingsPanelSchema } from '../../../../src/ui/settings/SettingsSchema'
import { SETTINGS_ACTION } from '../../../../src/ui/settings/SettingsActions'

const BASIC = { label: 'L', min: 0, max: 1, step: 0.1 }

const SAMPLE_SCHEMA: SettingsPanelSchema = {
    id: 'sample',
    title: 'Sample',
    icon: '❓',
    sections: [
        {
            heading: 'Section A',
            content: [
                { kind: 'range', setting: 'artworkRoughness', id: 'a', label: 'A', min: 0, max: 1, step: 0.1 },
                { kind: 'range', setting: 'artworkMetalness', id: 'b', label: 'B', min: 0, max: 1, step: 0.1 }
            ]
        },
        {
            heading: 'Section B',
            content: [
                { kind: 'range', setting: 'uiFontScale', id: 'c', label: 'C', min: 0, max: 1, step: 0.1 }
            ]
        }
    ]
}

describe('schemaSettingKeys', () => {
    it('flattens every control setting key across every section, in schema order', () => {
        expect(schemaSettingKeys(SAMPLE_SCHEMA)).toEqual(['artworkRoughness', 'artworkMetalness', 'uiFontScale'])
    })

    it('returns an empty array for a schema with no sections', () => {
        expect(schemaSettingKeys({ id: 'empty', title: 'Empty', icon: '❓', sections: [] })).toEqual([])
    })

    it('includes a toggle\'s setting alongside a range\'s, so a schema-driven reset restores both', () => {
        const mixed: SettingsPanelSchema = {
            id: 'mixed',
            title: 'Mixed',
            icon: '🎛️',
            sections: [{ content: [toggle('autoSave', { label: 'Auto-save' }), range('uiFontScale', BASIC)] }]
        }

        expect(schemaSettingKeys(mixed)).toEqual(['autoSave', 'uiFontScale'])
    })

    it('skips actions, which are not bound to a setting', () => {
        const withAction: SettingsPanelSchema = {
            id: 'actions',
            title: 'Actions',
            icon: '⚡',
            sections: [{ content: [action(SETTINGS_ACTION.Export, { label: 'Export' }), range('uiFontScale', BASIC)] }]
        }

        expect(schemaSettingKeys(withAction)).toEqual(['uiFontScale'])
    })

    it('skips notes, which are not bound to a setting', () => {
        const withNote: SettingsPanelSchema = {
            id: 'noted',
            title: 'Noted',
            icon: '📝',
            sections: [{ content: [{ kind: 'note', text: 'Just copy.' }, range('uiFontScale', BASIC)] }]
        }

        expect(schemaSettingKeys(withNote)).toEqual(['uiFontScale'])
    })
})

describe('schemaTabTitle', () => {
    it('qualifies the title with its group when the panel has one', () => {
        expect(schemaTabTitle({ id: 'x', title: 'Advanced', icon: '🔬', group: 'Display', sections: [] })).toBe('Display · Advanced')
    })

    it('is just the title when the panel has no group', () => {
        expect(schemaTabTitle({ id: 'x', title: 'Debug', icon: '🐞', sections: [] })).toBe('Debug')
    })
})

describe('toggle', () => {
    it('fills in the kind and carries the setting and copy through unchanged', () => {
        expect(toggle('autoSave', { label: 'Auto-save', description: 'Saves as you go.' })).toEqual({
            kind: 'toggle',
            setting: 'autoSave',
            id: 'auto-save',
            label: 'Auto-save',
            description: 'Saves as you go.'
        })
    })

    it('derives the id as the kebab-case of the setting key, unless overridden', () => {
        expect(toggle('showPerformanceStats', { label: 'Stats' }).id).toBe('show-performance-stats')
        expect(toggle('autoSave', { label: 'Auto-save', id: 'custom-id' }).id).toBe('custom-id')
    })
})

describe('action', () => {
    it('fills in the kind and uses the action id as the control id', () => {
        expect(action(SETTINGS_ACTION.Export, { label: 'Export Settings' })).toEqual({
            kind: 'action',
            action: SETTINGS_ACTION.Export,
            id: SETTINGS_ACTION.Export,
            label: 'Export Settings'
        })
    })

    it('carries a confirmation and the flatscreen-only flag through', () => {
        const confirm = { title: 'Sure?', message: 'Really.', confirmLabel: 'Yes' }

        expect(action(SETTINGS_ACTION.ResetAll, { label: 'Reset', confirm, flatscreenOnly: true })).toMatchObject({
            confirm,
            flatscreenOnly: true
        })
    })

    it('lets a panel that offers the same action twice give each its own id', () => {
        expect(action(SETTINGS_ACTION.Export, { label: 'Export', id: 'export-again' }).id).toBe('export-again')
    })
})

describe('range', () => {
    it('fills in the kind and carries the setting and copy through unchanged', () => {
        const control = range('artworkRoughness', { ...BASIC, label: 'Roughness', description: 'How matte.', trackLabels: ['a', 'b'] })

        expect(control).toMatchObject({
            kind: 'range',
            setting: 'artworkRoughness',
            label: 'Roughness',
            description: 'How matte.',
            min: 0,
            max: 1,
            step: 0.1,
            trackLabels: ['a', 'b']
        })
    })

    it('derives the id as the kebab-case of the setting key', () => {
        expect(range('shadowContactNormalBias', BASIC).id).toBe('shadow-contact-normal-bias')
        expect(range('uiFontScale', BASIC).id).toBe('ui-font-scale')
    })

    it('lets a control override the derived id', () => {
        expect(range('uiFontScale', { ...BASIC, id: 'custom-id' }).id).toBe('custom-id')
    })

    it.each([
        [1, 0, '3'],
        [0.5, 1, '3.0'],
        [0.1, 1, '3.0'],
        [0.05, 2, '3.00'],
        [0.01, 2, '3.00'],
        [0.001, 3, '3.000'],
        [0.0001, 4, '3.0000'],
        [1e-7, 7, '3.0000000']
    ])('shows as many decimals as the step has: step %s formats to %s decimals', (step, _decimals, expected) => {
        expect(range('uiFontScale', { ...BASIC, step }).formatDisplay?.(3)).toBe(expected)
    })

    it('appends the unit to the displayed value', () => {
        expect(range('uiFontScale', { ...BASIC, step: 0.05, unit: '×' }).formatDisplay?.(1.25)).toBe('1.25×')
    })

    it('does not leak the unit option onto the control itself', () => {
        expect(range('uiFontScale', { ...BASIC, unit: '×' })).not.toHaveProperty('unit')
    })
})
