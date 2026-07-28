import { describe, it, expect } from 'vitest'
import {
    LiminalCorridorLayout,
    LIMINAL_DEPTH_SLOTS,
    CORRIDOR_HALF_WIDTH_X,
    CORRIDOR_UNIT_SPACING_Z,
    CORRIDOR_FIRST_SLOT_OFFSET_Z,
    LEFT_FACING_ROTATION_Y,
    RIGHT_FACING_ROTATION_Y,
    computeSlotWorldZ,
    computeUnitTransform,
} from '../../../../src/scene/liminal/LiminalCorridorLayout'
import { RowStockStrategy } from '../../../../src/scene/props/shared/RowLayoutUtils'

describe('LiminalCorridorLayout', () => {
    it('is registered under the liminal mode', () => {
        expect(LiminalCorridorLayout.mode).toBe('liminal')
    })

    it('uses a near-only stocking strategy', () => {
        expect(LiminalCorridorLayout.createStockStrategy()).toBeInstanceOf(RowStockStrategy)
    })

    it('always returns exactly LIMINAL_DEPTH_SLOTS * 2 units, ignoring totalShelves', () => {
        const shelves = LiminalCorridorLayout.computeShelves(999)
        expect(shelves).toHaveLength(LIMINAL_DEPTH_SLOTS * 2)
    })

    it('returns the same fixed set regardless of the totalShelves argument', () => {
        const a = LiminalCorridorLayout.computeShelves(1)
        const b = LiminalCorridorLayout.computeShelves(500)
        expect(a).toEqual(b)
    })

    it('places one unit on each side of the aisle per depth slot', () => {
        const shelves = LiminalCorridorLayout.computeShelves(0)
        const leftUnits = shelves.filter(s => s.position.x < 0)
        const rightUnits = shelves.filter(s => s.position.x > 0)

        expect(leftUnits).toHaveLength(LIMINAL_DEPTH_SLOTS)
        expect(rightUnits).toHaveLength(LIMINAL_DEPTH_SLOTS)
        leftUnits.forEach(s => expect(s.position.x).toBeCloseTo(-CORRIDOR_HALF_WIDTH_X))
        rightUnits.forEach(s => expect(s.position.x).toBeCloseTo(CORRIDOR_HALF_WIDTH_X))
    })

    it('faces units inward, toward the aisle', () => {
        const shelves = LiminalCorridorLayout.computeShelves(0)
        const left = shelves.find(s => s.position.x < 0)!
        const right = shelves.find(s => s.position.x > 0)!

        expect(left.rotationY).toBeCloseTo(Math.PI / 2)
        expect(right.rotationY).toBeCloseTo(-Math.PI / 2)
    })

    it('spaces depth slots evenly, receding along -Z from the first-slot offset', () => {
        const shelves = LiminalCorridorLayout.computeShelves(0)
        const leftUnits = shelves
            .filter(s => s.position.x < 0)
            .sort((a, b) => b.position.z - a.position.z) // closest (least negative) first

        expect(leftUnits[0].position.z).toBeCloseTo(-CORRIDOR_FIRST_SLOT_OFFSET_Z)
        for (let i = 1; i < leftUnits.length; i++) {
            expect(leftUnits[i - 1].position.z - leftUnits[i].position.z).toBeCloseTo(CORRIDOR_UNIT_SPACING_Z)
        }
    })

    it('keeps all units on the ground plane', () => {
        const shelves = LiminalCorridorLayout.computeShelves(0)
        shelves.forEach(s => expect(s.position.y).toBe(0))
    })

    describe('computeSlotWorldZ / computeUnitTransform (Story 5 — recycling ranks)', () => {
        it('matches the fixed slot positions for ranks 0..LIMINAL_DEPTH_SLOTS-1', () => {
            const shelves = LiminalCorridorLayout.computeShelves(0)
            for (let rank = 0; rank < LIMINAL_DEPTH_SLOTS; rank++) {
                expect(computeSlotWorldZ(rank)).toBeCloseTo(-(CORRIDOR_FIRST_SLOT_OFFSET_Z + rank * CORRIDOR_UNIT_SPACING_Z))
            }
            expect(shelves).toHaveLength(LIMINAL_DEPTH_SLOTS * 2)
        })

        it('extends linearly for ranks beyond the initial window (post-recycle)', () => {
            expect(computeSlotWorldZ(5)).toBeCloseTo(computeSlotWorldZ(4) - CORRIDOR_UNIT_SPACING_Z)
            expect(computeSlotWorldZ(-1)).toBeCloseTo(computeSlotWorldZ(0) + CORRIDOR_UNIT_SPACING_Z)
        })

        it('computeUnitTransform places left/right at the correct X with inward-facing rotation', () => {
            const left = computeUnitTransform(2, 'left')
            const right = computeUnitTransform(2, 'right')

            expect(left.position.x).toBeCloseTo(-CORRIDOR_HALF_WIDTH_X)
            expect(right.position.x).toBeCloseTo(CORRIDOR_HALF_WIDTH_X)
            expect(left.rotationY).toBe(LEFT_FACING_ROTATION_Y)
            expect(right.rotationY).toBe(RIGHT_FACING_ROTATION_Y)
            expect(left.position.z).toBeCloseTo(computeSlotWorldZ(2))
            expect(right.position.z).toBeCloseTo(computeSlotWorldZ(2))
        })
    })
})
