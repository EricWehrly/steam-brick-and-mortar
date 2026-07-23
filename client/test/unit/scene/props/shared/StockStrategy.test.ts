import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { ArcStockStrategy } from '../../../../../src/scene/props/shared/ArcLayoutUtils'
import { RowStockStrategy } from '../../../../../src/scene/props/shared/RowLayoutUtils'
import { SpokeStockStrategy } from '../../../../../src/scene/props/shared/SpokeLayoutUtils'
import { computeSlotsPerShelf, GameLayoutConstants } from '../../../../../src/scene/props/shared/StockStrategy'
import type { BoardSurfacePair } from '../../../../../src/scene/props/shared/StockStrategy'
import type { StockSurface } from '../../../../../src/types/LayoutTypes'

function makeSurface(id: string): StockSurface {
    return {
        originPosition: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        slotStep: new THREE.Vector3(0.55, 0, 0),
        capacity: 3,
        // Store id in userData-like fashion via capacity offset for test identity
        // Actually just use a wrapper — cast to any for test identity
        _id: id,
    } as any
}

function makeBoard(nearId: string, farId: string): BoardSurfacePair {
    return { near: makeSurface(nearId), far: makeSurface(farId) }
}

describe('ArcStockStrategy', () => {
    it('returns all Near surfaces before all Far surfaces', () => {
        const strategy = new ArcStockStrategy()
        const boards = [
            makeBoard('b0.near', 'b0.far'),
            makeBoard('b1.near', 'b1.far'),
            makeBoard('b2.near', 'b2.far'),
        ]

        const ordered = strategy.order(boards)

        expect(ordered).toHaveLength(6)
        expect((ordered[0] as any)._id).toBe('b0.near')
        expect((ordered[1] as any)._id).toBe('b1.near')
        expect((ordered[2] as any)._id).toBe('b2.near')
        expect((ordered[3] as any)._id).toBe('b0.far')
        expect((ordered[4] as any)._id).toBe('b1.far')
        expect((ordered[5] as any)._id).toBe('b2.far')
    })

    it('handles a single board', () => {
        const strategy = new ArcStockStrategy()
        const ordered = strategy.order([makeBoard('near', 'far')])
        expect(ordered).toHaveLength(2)
        expect((ordered[0] as any)._id).toBe('near')
        expect((ordered[1] as any)._id).toBe('far')
    })

    it('returns empty list for no boards', () => {
        expect(new ArcStockStrategy().order([])).toHaveLength(0)
    })
})

describe('RowStockStrategy', () => {
    it('returns only Near surfaces, in board order', () => {
        const strategy = new RowStockStrategy()
        const boards = [
            makeBoard('b0.near', 'b0.far'),
            makeBoard('b1.near', 'b1.far'),
            makeBoard('b2.near', 'b2.far'),
        ]

        const ordered = strategy.order(boards)

        expect(ordered).toHaveLength(3)
        expect((ordered[0] as any)._id).toBe('b0.near')
        expect((ordered[1] as any)._id).toBe('b1.near')
        expect((ordered[2] as any)._id).toBe('b2.near')
    })

    it('never includes Far surfaces', () => {
        const strategy = new RowStockStrategy()
        const boards = [makeBoard('near', 'far')]
        const ordered = strategy.order(boards)
        expect(ordered.every(s => (s as any)._id !== 'far')).toBe(true)
    })

    it('returns empty list for no boards', () => {
        expect(new RowStockStrategy().order([])).toHaveLength(0)
    })
})

describe('computeSlotsPerShelf', () => {
    const boardCount = 3

    it('near-only strategies (Row) offer one surface per board', () => {
        const slots = computeSlotsPerShelf(new RowStockStrategy(), boardCount)
        expect(slots).toBe(boardCount * GameLayoutConstants.GAMES_PER_SURFACE)
    })

    it('near-only strategies (Spoke) offer one surface per board', () => {
        const slots = computeSlotsPerShelf(new SpokeStockStrategy(), boardCount)
        expect(slots).toBe(boardCount * GameLayoutConstants.GAMES_PER_SURFACE)
    })

    it('near+far strategies (Arc) offer two surfaces per board', () => {
        const slots = computeSlotsPerShelf(new ArcStockStrategy(), boardCount)
        expect(slots).toBe(boardCount * GameLayoutConstants.GAMES_PER_SURFACE * 2)
    })

    it('scales linearly with board count', () => {
        expect(computeSlotsPerShelf(new RowStockStrategy(), 5)).toBe(5 * GameLayoutConstants.GAMES_PER_SURFACE)
    })
})
