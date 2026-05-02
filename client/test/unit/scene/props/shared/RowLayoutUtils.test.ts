import { describe, it, expect } from 'vitest'
import { RowLayout, computeRowShelfLayout } from '../../../../../src/scene/props/shared/RowLayoutUtils'

describe('computeRowShelfLayout', () => {
    it('generates requested shelf count', () => {
        const shelves = computeRowShelfLayout(12)
        expect(shelves).toHaveLength(12)
    })

    it('keeps all shelves on y=0 plane', () => {
        const shelves = computeRowShelfLayout(10)
        shelves.forEach(shelf => expect(shelf.position.y).toBe(0))
    })

    it('places rows moving deeper into -Z', () => {
        const shelves = computeRowShelfLayout(16, { shelvesPerRow: 8, rowSpacingZ: 3 })
        const firstRowZ = shelves[0].position.z
        const secondRowZ = shelves[8].position.z
        expect(secondRowZ).toBeLessThan(firstRowZ)
    })

    it('leaves a central aisle gap between left and right shelf blocks', () => {
        const shelves = computeRowShelfLayout(8, {
            shelvesPerRow: 8,
            shelfSpacingX: 2.5,
            centralAisleWidthX: 3.0,
        })
        const row0 = shelves.filter(shelf => shelf.row === 0).sort((a, b) => a.position.x - b.position.x)
        const leftInner = row0.filter(shelf => shelf.position.x < 0).at(-1)
        const rightInner = row0.find(shelf => shelf.position.x > 0)

        expect(leftInner).toBeDefined()
        expect(rightInner).toBeDefined()
        expect((rightInner?.position.x ?? 0) - (leftInner?.position.x ?? 0)).toBeGreaterThan(5.0)
    })
})

describe('RowLayout section-aware shelf ownership', () => {
    it('assigns contiguous shelf ranges per section in order', () => {
        const sections = [
            { name: 'Action', games: Array.from({ length: 36 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'Puzzle', games: Array.from({ length: 18 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'RPG', games: Array.from({ length: 54 }, (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = RowLayout.computeShelvesForSections(sections)
        const sectionIndices = shelves.map(shelf => shelf.sectionIndex)

        // 36 -> 2 shelves, 18 -> 1 shelf, 54 -> 3 shelves
        expect(sectionIndices).toEqual([0, 0, 1, 2, 2, 2])
    })

    it('expands row spacing dynamically for larger section shelf counts', () => {
        const sections = [
            { name: 'Action', games: Array.from({ length: 360 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'Puzzle', games: Array.from({ length: 320 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'RPG', games: Array.from({ length: 280 }, (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = RowLayout.computeShelvesForSections(sections)
        const zValues = shelves.map(shelf => shelf.position.z)
        const minZ = Math.min(...zValues)

        // Dynamic spacing should push rows deeper than the baseline fixed layout depth.
        expect(minZ).toBeLessThan(-12)
    })
})
