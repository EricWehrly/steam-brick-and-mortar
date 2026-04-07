import { describe, it, expect } from 'vitest'
import { computeArcShelfLayout } from './ArcLayoutUtils'

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
})