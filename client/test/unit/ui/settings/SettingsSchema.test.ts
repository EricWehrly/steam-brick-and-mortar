import { describe, it, expect } from 'vitest'
import { schemaSettingKeys, type SettingsPanelSchema } from '../../../../src/ui/settings/SettingsSchema'

const SAMPLE_SCHEMA: SettingsPanelSchema = {
    id: 'sample',
    title: 'Sample',
    icon: '❓',
    sections: [
        {
            heading: 'Section A',
            controls: [
                { kind: 'range', setting: 'artworkRoughness', id: 'a', label: 'A', min: 0, max: 1, step: 0.1 },
                { kind: 'range', setting: 'artworkMetalness', id: 'b', label: 'B', min: 0, max: 1, step: 0.1 }
            ]
        },
        {
            heading: 'Section B',
            controls: [
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
})
