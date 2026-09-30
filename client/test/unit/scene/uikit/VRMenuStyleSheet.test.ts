/**
 * Guards the seam between styles/vr-menu.css and the TypeScript that names its classes. A class in
 * one but not the other is an invisible bug: uikit only console-warns on an unknown class name, and
 * a stylesheet rule nothing references is dead weight that looks like it's doing something.
 */

import { describe, it, expect } from 'vitest'
import { StyleSheet } from '@pmndrs/uikit'
import { MENU_CLASS, VR_MENU_STYLES } from '../../../../src/scene/uikit/VRMenuStyleSheet'
import { COLOR_TOKENS } from '../../../../src/ui/ColorTokens'

describe('VR menu stylesheet', () => {
    const declaredClasses = Object.values(MENU_CLASS)
    const styledClasses = Object.keys(VR_MENU_STYLES)

    it('styles every class MENU_CLASS names', () => {
        const missing = declaredClasses.filter(name => !styledClasses.includes(name))

        expect(missing).toEqual([])
    })

    it('has no rule for a class MENU_CLASS does not name', () => {
        const unreferenced = styledClasses.filter(name => !declaredClasses.includes(name as never))

        expect(unreferenced).toEqual([])
    })

    it('has no duplicate class names in MENU_CLASS', () => {
        expect(new Set(declaredClasses).size).toBe(declaredClasses.length)
    })

    it('registers every class into uikit\'s own StyleSheet registry', () => {
        for (const name of declaredClasses) {
            expect(StyleSheet[name]).toBeDefined()
        }
    })

    it('resolves color tokens by their tokens.css names, not literals', () => {
        expect(VR_MENU_STYLES[MENU_CLASS.menuRoot].backgroundColor).toBe(COLOR_TOKENS.surface1)
        expect(VR_MENU_STYLES[MENU_CLASS.menuTabButtonActive].backgroundColor).toBe(COLOR_TOKENS.surface3)
        expect(VR_MENU_STYLES[MENU_CLASS.categoryStatusPlanned].color).toBe(COLOR_TOKENS.warning)
    })

    it('draws both kinds of root over scene geometry, above the controller pointer', () => {
        for (const root of [MENU_CLASS.menuRoot, MENU_CLASS.standalonePanelRoot]) {
            expect(VR_MENU_STYLES[root].depthTest).toBe(false)
            expect(VR_MENU_STYLES[root].renderOrder).toBe(1000)
        }
    })

    it('expands the shared corner radius onto both roots', () => {
        for (const root of [MENU_CLASS.menuRoot, MENU_CLASS.standalonePanelRoot]) {
            expect(VR_MENU_STYLES[root].borderTopLeftRadius).toBe(12)
            expect(VR_MENU_STYLES[root].borderBottomRightRadius).toBe(12)
        }
    })
})
