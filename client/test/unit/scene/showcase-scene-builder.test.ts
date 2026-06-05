import { describe, expect, it } from 'vitest'

import { SHOWCASE_REFERENCE_GAMES, buildShowcaseComparisonGrid } from '../../../src/scene/bootstrap/ShowcaseBootstrapPath'

describe('Showcase showcase grid', () => {
    it('uses first 3 anonymous-store appids as fixed references', () => {
        expect(SHOWCASE_REFERENCE_GAMES.length).toBe(3)
    })

    it('builds a 3-slot side-by-side comparison layout', () => {
        const slots = buildShowcaseComparisonGrid('roughness')

        expect(slots).toHaveLength(3)
        expect(slots.map(slot => slot.appid)).toEqual(SHOWCASE_REFERENCE_GAMES)
        expect(slots.map(slot => slot.x)).toEqual([-2, 0, 2])
        expect(slots.map(slot => slot.presetName)).toEqual(['baseline', 'variant-a', 'variant-b'])
    })
})
