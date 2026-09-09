import { describe, it, expect } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { VR_MENU_SCHEMAS, DEFAULT_VR_MENU_TAB_PANEL_ID, findVRMenuSchema } from '../../../../src/scene/uikit/VRMenuTabRegistry'
import { buildSettingsPanel } from '../../../../src/scene/uikit/SettingsSchemaUIKitRenderer'

describe('VR_MENU_SCHEMAS', () => {
    it('has at least two entries so the shell has something to switch between', () => {
        expect(VR_MENU_SCHEMAS.length).toBeGreaterThanOrEqual(2)
    })

    it('has no duplicate panel ids', () => {
        const ids = VR_MENU_SCHEMAS.map(schema => schema.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('defaults to the first registered tab', () => {
        expect(DEFAULT_VR_MENU_TAB_PANEL_ID).toBe(VR_MENU_SCHEMAS[0].id)
    })

    it('finds a registered schema by panel id, and nothing for an unknown one', () => {
        expect(findVRMenuSchema(VR_MENU_SCHEMAS[0].id)).toBe(VR_MENU_SCHEMAS[0])
        expect(findVRMenuSchema('not-a-real-panel')).toBeUndefined()
    })

    it('every registered schema builds real content without throwing', () => {
        const appSettings = AppSettings.getInstance()
        for (const schema of VR_MENU_SCHEMAS) {
            expect(() => buildSettingsPanel(schema, appSettings)).not.toThrow()
        }
    })
})
