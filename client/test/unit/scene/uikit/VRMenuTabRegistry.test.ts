import { describe, it, expect } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { VR_MENU_TABS, DEFAULT_VR_MENU_TAB_PANEL_ID } from '../../../../src/scene/uikit/VRMenuTabRegistry'

describe('VR_MENU_TABS', () => {
    it('has at least two entries so the shell has something to switch between', () => {
        expect(VR_MENU_TABS.length).toBeGreaterThanOrEqual(2)
    })

    it('has no duplicate panel ids', () => {
        const ids = VR_MENU_TABS.map(tab => tab.panelId)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('defaults to the first registered tab', () => {
        expect(DEFAULT_VR_MENU_TAB_PANEL_ID).toBe(VR_MENU_TABS[0].panelId)
    })

    it('every tab builds real content without throwing', () => {
        const appSettings = AppSettings.getInstance()
        for (const tab of VR_MENU_TABS) {
            expect(() => tab.build(appSettings)).not.toThrow()
        }
    })
})
