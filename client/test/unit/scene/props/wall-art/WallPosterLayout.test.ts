import { describe, it, expect } from 'vitest'
import { computeWallPosterSlots, FRAME_OUTER_WIDTH_METERS } from '../../../../../src/scene/props/wall-art/WallPosterLayout'

describe('computeWallPosterSlots', () => {
    it('centers an odd slot count on the wall midpoint with 3-frame-width gap pitch', () => {
        const slots = computeWallPosterSlots(32)

        expect(slots).toHaveLength(3)
        expect(slots[1]).toBeCloseTo(0)
        for (let i = 1; i < slots.length; i++) {
            expect(slots[i] - slots[i - 1]).toBeCloseTo(FRAME_OUTER_WIDTH_METERS * 4)
        }
    })

    it('returns no slots when the wall is narrower than one frame plus its corner margins', () => {
        expect(computeWallPosterSlots(1.5)).toEqual([])
    })

    it('returns exactly one centered slot at the minimum width that fits one frame', () => {
        const slots = computeWallPosterSlots(FRAME_OUTER_WIDTH_METERS + 2 * FRAME_OUTER_WIDTH_METERS)

        expect(slots).toEqual([0])
    })

    it('scales slot count with wall width', () => {
        expect(computeWallPosterSlots(60).length).toBeGreaterThan(computeWallPosterSlots(22).length)
    })
})
