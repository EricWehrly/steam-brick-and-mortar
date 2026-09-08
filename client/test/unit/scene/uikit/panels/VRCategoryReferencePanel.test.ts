/**
 * VRCategoryReferencePanel - pure structural tests. Real @pmndrs/uikit Container/Text instances
 * construct fine under jsdom (see VRDisplayAdvancedPanel.test.ts's doc comment) - content is
 * static reference data, no async fetch, no AppSettings binding to exercise.
 */

import { describe, it, expect } from 'vitest'
import { VRCategoryReferencePanel } from '../../../../../src/scene/uikit/panels/VRCategoryReferencePanel'
import { STEAM_GENRE_CATEGORIES, META_CATEGORIES, SORT_DIMENSIONS } from '../../../../../src/ui/CategoryReferencePanel'

describe('VRCategoryReferencePanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        expect(() => new VRCategoryReferencePanel()).not.toThrow()
    })

    it('builds all three category sections into the scroll container, one row per entry', () => {
        const panel = new VRCategoryReferencePanel()

        // container children: title Text, scroll Container.
        expect(panel.container.children).toHaveLength(2)
        const scroll = panel.container.children[1]
        expect(scroll.children).toHaveLength(3)

        // Each section: 1 heading Text + 1 row Container per entry.
        const [genresSection, metaSection, sortSection] = scroll.children
        expect(genresSection.children).toHaveLength(1 + STEAM_GENRE_CATEGORIES.length)
        expect(metaSection.children).toHaveLength(1 + META_CATEGORIES.length)
        expect(sortSection.children).toHaveLength(1 + SORT_DIMENSIONS.length)
    })
})
