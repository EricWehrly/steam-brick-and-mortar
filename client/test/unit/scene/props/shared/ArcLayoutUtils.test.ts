import { describe, it, expect } from 'vitest'
import { ArcLayout, computeArcShelfLayout } from '../../../../../src/scene/props/shared/ArcLayoutUtils'

describe('computeArcShelfLayout', () => {
    it('generates the correct number of shelf positions', () => {
        const shelves = computeArcShelfLayout(20)
        expect(shelves).toHaveLength(20)
    })

    it('does not exceed totalShelves even if row capacity is larger', () => {
        const shelves = computeArcShelfLayout(7)
        expect(shelves).toHaveLength(7)
    })

    it('all positions have y = 0', () => {
        const shelves = computeArcShelfLayout(10)
        shelves.forEach(s => expect(s.position.y).toBe(0))
    })

    it('all positions are in the -Z half-space (in front of player)', () => {
        const shelves = computeArcShelfLayout(20)
        shelves.forEach(s => expect(s.position.z).toBeLessThan(0))
    })

    it('successive rows have increasing arc radius (further from origin)', () => {
        const shelves = computeArcShelfLayout(20, { rows: 4, shelvesPerRow: 4 })
        // Centre shelf of each row (index 1 in a 4-shelf row) should be further each time
        const centreShelves = [0, 4, 8, 12].map(i => shelves[i + 1])
        const radii = centreShelves.map(s => Math.sqrt(s.position.x ** 2 + s.position.z ** 2))
        for (let i = 1; i < radii.length; i++) {
            expect(radii[i]).toBeGreaterThan(radii[i - 1])
        }
    })

    it('shelves face toward origin: the shelf-front direction (after rotY) points at (0,0,0)', () => {
        const shelves = computeArcShelfLayout(8, { rows: 2, shelvesPerRow: 4 })
        for (const s of shelves) {
            // Shelf front in local space is +Z before rotation.
            // After rotationY, front direction = (sin(rotY), 0, cos(rotY)).
            // For inward facing, this vector should point from shelf position toward origin,
            // i.e., roughly (-x, 0, -z) normalised.
            const dx = -s.position.x
            const dz = -s.position.z
            const len = Math.sqrt(dx * dx + dz * dz)
            const toOriginX = dx / len
            const toOriginZ = dz / len

            const frontX = Math.sin(s.rotationY)
            const frontZ = Math.cos(s.rotationY)

            const dot = frontX * toOriginX + frontZ * toOriginZ
            // Dot product > 0.95 means within ~18 deg of pointing at origin
            expect(dot).toBeGreaterThan(0.95)
        }
    })

    it('44-shelf layout keeps walkable side gaps on rows 0-3 and allows tighter last row', () => {
        const shelves = computeArcShelfLayout(44, {
            rows: 5,
            shelvesPerRowByRow: [4, 6, 10, 12, 12],
            firstRowRadius: 4.5,
            rowRadiusStep: 4.0,
            halfAngle: Math.PI / 3,
            halfAngleByRow: [Math.PI / 4.2, Math.PI / 3.8, Math.PI / 3.2, Math.PI / 3.0, Math.PI / 2.6],
            minShelfGap: 1.0,
            shelfWidthMetres: 2.0,
        })

        const rows = new Map<number, typeof shelves>()
        for (const s of shelves) {
            if (!rows.has(s.row)) rows.set(s.row, [])
            rows.get(s.row)!.push(s)
        }

        // For each row, sort by indexInRow then compute adjacent centre distances
        const SHELF_WIDTH = 2.0
        for (let row = 0; row < 5; row++) {
            const rowShelves = (rows.get(row) ?? []).sort((a, b) => a.indexInRow - b.indexInRow)
            for (let i = 1; i < rowShelves.length; i++) {
                const a = rowShelves[i - 1].position
                const b = rowShelves[i].position
                const dist = Math.hypot(b.x - a.x, b.z - a.z)
                const gap = dist - SHELF_WIDTH

                if (row < 4) {
                    // Rows 0-3 should keep at least 1m side aisle gap
                    expect(gap).toBeGreaterThanOrEqual(0.95)
                } else {
                    // Last row may be tighter to maximize back wall density
                    expect(gap).toBeGreaterThan(0.2)
                }
            }
        }
    })

    // --- Regression: batch-count mismatch (shelf position overflow) ---
    // Verifies the production arc config never allocates fewer positions than requested.
    // This catches the "CRITICAL: Shelf position N is undefined" bug (ea54d8d).
    it.each([
        [44, 'lower bound typical library'],
        [47, 'observed production count (spitemonger)'],
        [52, 'headroom for larger libraries'],
        [80, 'large library'],
    ])('allocates exactly %i positions for %s', (total) => {
        const FIXED = 4 + 6 + 10 + 12
        const shelves = computeArcShelfLayout(total, {
            rows: 5,
            shelvesPerRow: 10,
            shelvesPerRowByRow: [4, 6, 10, 12, Math.max(1, total - FIXED)],
            halfAngle: Math.PI / 3,
            halfAngleByRow: [
                Math.PI / 3,
                Math.PI / 3.5,
                Math.PI / 3,
                Math.PI / 3,
                Math.PI / 2.6,
            ],
            minShelfGap: 1.0,
            shelfWidthMetres: 2.0,
            rowRadiusStep: 4.0,
            firstRowRadius: 5.5,
        })
        expect(shelves.length).toBe(total)
        // Every position must be defined (no undefined slot)
        shelves.forEach((s, i) => {
            expect(s, `shelf ${i} should be defined`).toBeDefined()
            expect(isFinite(s.position.x), `shelf ${i} x must be finite`).toBe(true)
            expect(isFinite(s.position.z), `shelf ${i} z must be finite`).toBe(true)
        })
    })
})

describe('section-aware arc layout', () => {
    it('each section owns contiguous ring bands (no mixed-section rows)', () => {
        const sections = [
            { name: 'Puzzle', games: Array.from({ length: 50 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'RPG', games: Array.from({ length: 120 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'Action', games: Array.from({ length: 280 }, (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = ArcLayout.computeShelvesForSections(sections)
        expect(shelves.length).toBeGreaterThan(0)

        // Build a map of row → set of section indices
        const rowToSections = new Map<number, Set<number>>()
        for (const shelf of shelves) {
            if (!rowToSections.has(shelf.row)) rowToSections.set(shelf.row, new Set())
            rowToSections.get(shelf.row)!.add(shelf.sectionIndex)
        }

        // Every row must be owned by exactly one section (ring-band semantics)
        for (const [, sectionSet] of rowToSections) {
            expect(sectionSet.size).toBe(1)
        }
    })

    it('sections are sorted smallest-first so inner rings are tightest', () => {
        const sections = [
            // Deliberately pass largest-first to verify auto-sort
            { name: 'Action', games: Array.from({ length: 280 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'RPG',    games: Array.from({ length: 120 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'Puzzle', games: Array.from({ length: 50 },  (_, i) => ({ appid: 2000 + i + 1 })) },
        ] as any

        const shelves = ArcLayout.computeShelvesForSections(sections)
        expect(shelves.length).toBeGreaterThan(0)

        // Inner rings (row 0) should belong to the smallest section (Puzzle = originalIndex 2)
        const innerShelves = shelves.filter((s) => s.row === 0)
        const innerSections = new Set(innerShelves.map((s) => s.sectionIndex))
        // The smallest section (50 games = Puzzle, originalIndex 2) should be closest
        const smallestOriginalIndex = 2
        expect(innerSections.has(smallestOriginalIndex)).toBe(true)
    })

    it('expands arc depth dynamically for larger section shelf counts', () => {
        const sections = [
            { name: 'Action', games: Array.from({ length: 500 }, (_, i) => ({ appid: i + 1 })) },
            { name: 'Puzzle', games: Array.from({ length: 420 }, (_, i) => ({ appid: 1000 + i + 1 })) },
            { name: 'RPG', games: Array.from({ length: 320 }, (_, i) => ({ appid: 2000 + i + 1 })) },
            { name: 'Indie', games: Array.from({ length: 260 }, (_, i) => ({ appid: 3000 + i + 1 })) },
        ] as any

        const shelves = ArcLayout.computeShelvesForSections(sections)
        const furthestZ = Math.min(...shelves.map((shelf) => shelf.position.z))

        // Large section depths should push the outer arc further than fixed baseline depths.
        expect(furthestZ).toBeLessThan(-24)
    })
})

describe('partial-row centering', () => {
    it('single shelf in a row lands at angle=0 (straight ahead, not off to the side)', () => {
        const shelves = computeArcShelfLayout(1, {
            rows: 5,
            shelvesPerRow: 4,
            firstRowRadius: 5.5,
            halfAngle: Math.PI / 3,
        })
        expect(shelves).toHaveLength(1)
        // Straight ahead is x≈0, z≈-radius. Allow ±0.01m tolerance.
        expect(Math.abs(shelves[0].position.x)).toBeLessThan(0.01)
        expect(shelves[0].position.z).toBeCloseTo(-5.5, 1)
    })

    it('two shelves in a four-slot row are symmetric around x=0', () => {
        const shelves = computeArcShelfLayout(2, {
            rows: 5,
            shelvesPerRow: 4,
            firstRowRadius: 5.5,
            halfAngle: Math.PI / 3,
        })
        expect(shelves).toHaveLength(2)
        const xSum = shelves[0].position.x + shelves[1].position.x
        expect(Math.abs(xSum)).toBeLessThan(0.01) // symmetric around x=0
    })

    it('interrupts arc rows around the center aisle opening', () => {
        const shelves = computeArcShelfLayout(8, {
            rows: 1,
            shelvesPerRow: 8,
            firstRowRadius: 7,
            halfAngle: Math.PI / 3,
            centerAisleHalfAngle: Math.PI / 12,
        })

        const closestToCenterX = Math.min(...shelves.map(shelf => Math.abs(shelf.position.x)))
        expect(closestToCenterX).toBeGreaterThan(1.7)
    })

    it('does not place a single-shelf row at x=0 when center aisle width interruption is enabled', () => {
        const shelves = computeArcShelfLayout(1, {
            rows: 1,
            shelvesPerRow: 1,
            firstRowRadius: 5.5,
            halfAngle: Math.PI / 3,
            centerAisleHalfWidthX: 2.5,
        })

        expect(shelves).toHaveLength(1)
        expect(Math.abs(shelves[0].position.x)).toBeGreaterThanOrEqual(2.45)
    })
})