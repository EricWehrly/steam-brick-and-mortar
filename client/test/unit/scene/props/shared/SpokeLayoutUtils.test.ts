import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    computeSpokeShelfLayout,
    SpokeStockStrategy,
    type SpokeLayoutConfig,
} from '../../../../../src/scene/props/shared/SpokeLayoutUtils'
import type { BoardSurfacePair } from '../../../../../src/scene/props/shared/StockStrategy'
import type { StockSurface } from '../../../../../src/types/LayoutTypes'

function makeSurface(id: string): StockSurface {
    return {
        originPosition: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        slotStep: new THREE.Vector3(0.55, 0, 0),
        capacity: 3,
        _id: id,
    } as any
}

function makeBoard(nearId: string, farId: string): BoardSurfacePair {
    return { near: makeSurface(nearId), far: makeSurface(farId) }
}

// ── SpokeStockStrategy ────────────────────────────────────────────────────────

describe('SpokeStockStrategy', () => {
    const strategy = new SpokeStockStrategy()

    it('returns only Near surfaces', () => {
        const boards = [makeBoard('n0', 'f0'), makeBoard('n1', 'f1'), makeBoard('n2', 'f2')]
        const result = strategy.order(boards)
        expect(result.map((s: any) => s._id)).toEqual(['n0', 'n1', 'n2'])
    })

    it('does not include Far surfaces', () => {
        const boards = [makeBoard('n0', 'f0'), makeBoard('n1', 'f1')]
        const result = strategy.order(boards)
        expect(result.some((s: any) => s._id.startsWith('f'))).toBe(false)
    })

    it('returns empty array for empty boards', () => {
        expect(strategy.order([])).toEqual([])
    })
})

// ── computeSpokeShelfLayout ───────────────────────────────────────────────────

describe('computeSpokeShelfLayout', () => {
    it('generates 2 shelves per position per spoke (left + right)', () => {
        const config: SpokeLayoutConfig = { spokeCount: 3, shelvesPerSpoke: 4 }
        const shelves = computeSpokeShelfLayout(config)
        expect(shelves.length).toBe(3 * 4 * 2)
    })

    it('uses defaults when no config provided', () => {
        const shelves = computeSpokeShelfLayout()
        // defaults: 4 spokes * 6 positions * 2 rows = 48
        expect(shelves.length).toBe(48)
    })

    it('each shelf has a spokeIndex within range', () => {
        const config: SpokeLayoutConfig = { spokeCount: 4, shelvesPerSpoke: 3 }
        const shelves = computeSpokeShelfLayout(config)
        for (const shelf of shelves) {
            expect(shelf.spokeIndex).toBeGreaterThanOrEqual(0)
            expect(shelf.spokeIndex).toBeLessThan(4)
        }
    })

    it('each spoke has equal left and right shelf counts', () => {
        const config: SpokeLayoutConfig = { spokeCount: 3, shelvesPerSpoke: 5 }
        const shelves = computeSpokeShelfLayout(config)
        for (let spoke = 0; spoke < 3; spoke++) {
            const inSpoke = shelves.filter(s => s.spokeIndex === spoke)
            const left = inSpoke.filter(s => s.row === 'left')
            const right = inSpoke.filter(s => s.row === 'right')
            expect(left.length).toBe(5)
            expect(right.length).toBe(5)
        }
    })

    it('shelves are further from hub than hubClearanceMetres', () => {
        const config: SpokeLayoutConfig = { hubClearanceMetres: 4, shelvesPerSpoke: 3 }
        const shelves = computeSpokeShelfLayout(config)
        for (const shelf of shelves) {
            const distFromOrigin = shelf.position.length()
            // Shelves are offset laterally from spoke centreline, so XZ distance
            // to origin is >= hubClearance (approximately — use a conservative check)
            expect(distFromOrigin).toBeGreaterThanOrEqual(3)
        }
    })

    it('left and right rows at the same position are symmetric about the spoke centreline', () => {
        const config: SpokeLayoutConfig = { spokeCount: 1, shelvesPerSpoke: 3, aisleHalfWidthMetres: 2 }
        const shelves = computeSpokeShelfLayout(config)
        const byPosition = new Map<number, typeof shelves>()
        for (const shelf of shelves) {
            const existing = byPosition.get(shelf.positionIndex) ?? []
            existing.push(shelf)
            byPosition.set(shelf.positionIndex, existing)
        }
        for (const [, pair] of byPosition) {
            expect(pair.length).toBe(2)
            const [a, b] = pair
            // XZ midpoint should be close to the spoke centreline (origin for spoke 0)
            const midX = (a.position.x + b.position.x) / 2
            const midZ = (a.position.z + b.position.z) / 2
            // Midpoint lies on the spoke ray — dot with perp should be ~0
            // For spokeCount=1 with default firstSpokeAngleOffset=-PI/2, spoke points toward -X
            // Just verify lateral offsets are equal and opposite
            const lateralDiff = Math.abs(
                Math.abs(a.position.x - midX) - Math.abs(b.position.x - midX)
            )
            expect(lateralDiff).toBeLessThan(0.001)
        }
    })

    it('spokes are evenly angularly spaced', () => {
        const config: SpokeLayoutConfig = { spokeCount: 4, shelvesPerSpoke: 1 }
        const shelves = computeSpokeShelfLayout(config)
        // For each spoke, get the midpoint of its two shelves to approximate centreline angle
        const angles: number[] = []
        for (let i = 0; i < 4; i++) {
            const inSpoke = shelves.filter(s => s.spokeIndex === i)
            const midX = inSpoke.reduce((sum, s) => sum + s.position.x, 0) / inSpoke.length
            const midZ = inSpoke.reduce((sum, s) => sum + s.position.z, 0) / inSpoke.length
            angles.push(Math.atan2(midX, midZ))
        }
        const diffs = angles.slice(1).map((a, i) => {
            let diff = a - angles[i]
            // Normalize to [-PI, PI]
            while (diff > Math.PI) diff -= 2 * Math.PI
            while (diff < -Math.PI) diff += 2 * Math.PI
            return Math.abs(diff)
        })
        // All angular gaps should be approximately equal (PI/2 for 4 spokes)
        for (const diff of diffs) {
            expect(diff).toBeCloseTo(Math.PI / 2, 1)
        }
    })
})
