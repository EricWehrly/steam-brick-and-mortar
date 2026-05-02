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
    it('keeps each section shelf count while balancing assignment across aisle regions', () => {
        const sections = [
            { name: 'Action', games: Array.from({ length: 36 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'Puzzle', games: Array.from({ length: 18 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'RPG', games: Array.from({ length: 54 }, (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = RowLayout.computeShelvesForSections(sections)
        const shelvesPerSection = sections.map((section: { games: unknown[] }) => Math.max(1, Math.ceil(section.games.length / 18)))

        for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
            const actual = shelves.filter(shelf => shelf.sectionIndex === sectionIndex).length
            expect(actual).toBe(shelvesPerSection[sectionIndex])
        }

        const negativeCount = shelves.filter(shelf => shelf.position.x < 0).length
        const positiveCount = shelves.filter(shelf => shelf.position.x > 0).length

        expect(Math.abs(negativeCount - positiveCount)).toBeLessThanOrEqual(1)
    })

    it('allows large sections to straddle the aisle when one side cannot fit all shelves', () => {
        const sections = [
            { name: 'Huge', games: Array.from({ length: 144 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'TinyA', games: Array.from({ length: 18 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'TinyB', games: Array.from({ length: 18 }, (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = RowLayout.computeShelvesForSections(sections)
        const hugeShelves = shelves.filter(shelf => shelf.sectionIndex === 0)

        expect(hugeShelves.some(shelf => shelf.position.x < 0)).toBe(true)
        expect(hugeShelves.some(shelf => shelf.position.x > 0)).toBe(true)
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
