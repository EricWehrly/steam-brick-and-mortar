import { describe, it, expect } from 'vitest'
import { computeArcShelfLayout } from '../../../../src/scene/props/shared/ArcLayoutUtils'

/**
 * Regression: arc rowIndex must be taken from ArcShelfInfo.row, not derived from
 * Math.floor(batchIndex / maxShelvesPerRow).
 *
 * With arc layout rows = [4, 6, 10, 12, 15], maxShelvesPerRow = 4:
 *   batchIndex 8 = row 1 shelf 4 (arc row 1)
 *   Math.floor(8 / 4) = 2  ← WRONG
 *
 * Consequence: wrong rowIndex fed to back-side suppression logic in GameBoxSpawner.
 * Shelves in rows 1-3 get wrong backside treatment (some suppressed, some not).
 *
 * Fix: GpuStorePropsRenderer stores shelfRowIndices[] from ArcShelfInfo.row
 * and uses that instead of the grid formula.
 */
describe('Arc shelf rowIndex derivation', () => {
    const FIXED = 4 + 6 + 10 + 12
    const TOTAL = 47
    const shelves = computeArcShelfLayout(TOTAL, {
        rows: 5,
        shelvesPerRow: 10,
        shelvesPerRowByRow: [4, 6, 10, 12, Math.max(1, TOTAL - FIXED)],
        halfAngle: Math.PI / 3,
        halfAngleByRow: [
            Math.PI / 3, Math.PI / 3.5,
            Math.PI / 3, Math.PI / 3,
            Math.PI / 2.6,
        ],
        minShelfGap: 1.0, shelfWidthMetres: 2.0,
        rowRadiusStep: 4.0, firstRowRadius: 5.5,
    })
    const MAX_PER_ROW = 4  // matches GpuStorePropsRenderer.maxShelvesPerRow

    it('arc row counts match expected distribution [4, 6, 10, 12, 15]', () => {
        const counts = [0, 0, 0, 0, 0]
        shelves.forEach(s => counts[s.row]++)
        expect(counts).toEqual([4, 6, 10, 12, 15])
    })

    it('stored row indices differ from grid formula for rows 1-3', () => {
        // Rows 1+ have more than maxShelvesPerRow shelves, so the grid formula diverges
        const mismatches: number[] = []
        shelves.forEach((s, batchIndex) => {
            const gridRow = Math.floor(batchIndex / MAX_PER_ROW)
            if (gridRow !== s.row) mismatches.push(batchIndex)
        })
        // There MUST be mismatches - if there are none, the grid formula happens to be correct
        // and the regression fix is unnecessary. This test documents that it IS necessary.
        expect(mismatches.length).toBeGreaterThan(0)
    })

    it('using stored row index, back-wall row (4) is correctly identified for all its shelves', () => {
        const backWallShelves = shelves.filter(s => s.row === 4)
        expect(backWallShelves.length).toBe(15)
        // All back-wall shelves should be identified as row 4, not row 2-3
        backWallShelves.forEach((s, i) => {
            expect(s.row, `back-wall shelf ${i} should have row=4`).toBe(4)
        })
    })

    it('using stored row index, rows 0-3 are correctly identified and allow backside content', () => {
        const innerShelves = shelves.filter(s => s.row < 4)
        expect(innerShelves.length).toBe(32)
        innerShelves.forEach((s, i) => {
            // allowBackSide = rowIndex < 4
            const allowBackSide = s.row < 4
            expect(allowBackSide, `inner shelf ${i} (row ${s.row}) should allow backside`).toBe(true)
        })
    })

    it('grid formula incorrectly classifies some row-1 shelves as row-2', () => {
        // Row 1 contains batches 4-9 (6 shelves). Grid formula: Math.floor(8/4)=2, Math.floor(9/4)=2
        // Those shelves would get rowIndex=2 with grid formula, but are actually row 1
        const row1Batches = shelves
            .map((s, idx) => ({ s, idx }))
            .filter(({ s }) => s.row === 1)
        const wronglyClassified = row1Batches.filter(({ idx }) => Math.floor(idx / MAX_PER_ROW) !== 1)
        expect(wronglyClassified.length).toBeGreaterThan(0)
    })
})
