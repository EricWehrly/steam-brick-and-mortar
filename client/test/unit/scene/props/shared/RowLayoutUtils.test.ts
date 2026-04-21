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
})
