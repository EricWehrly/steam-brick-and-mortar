import { describe, it, expect } from 'vitest'
import { schemaSettingKeys, DISPLAY_ADVANCED_SCHEMA } from '../../../../src/ui/settings/SettingsSchema'

describe('schemaSettingKeys', () => {
    it('flattens every control setting key across every section, in schema order', () => {
        expect(schemaSettingKeys(DISPLAY_ADVANCED_SCHEMA)).toEqual([
            'artworkRoughness',
            'artworkMetalness',
            'artworkFresnelLift',
            'artworkFresnelPower',
            'shadowContactBias',
            'shadowContactNormalBias'
        ])
    })

    it('returns an empty array for a schema with no sections', () => {
        expect(schemaSettingKeys({ id: 'empty', title: 'Empty', icon: '❓', sections: [] })).toEqual([])
    })
})
