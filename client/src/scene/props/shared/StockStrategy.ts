/**
 * StockStrategy
 *
 * Defines how StockSurfaces are ordered for game placement on a shelf unit.
 * The spawner fills surfaces in the order the strategy returns them — first
 * surface fills first, last surface fills last (or not at all if games run out).
 *
 * The strategy receives per-board surface pairs (Near + Far) and returns a
 * flat ordered list. It does not compute geometry — that is GameBoxUtils' job.
 */

import type { StockSurface } from '../../../types/LayoutTypes'

export interface BoardSurfacePair {
    /** The inward-facing surface the player sees. */
    near: StockSurface
    /** The outward-facing overflow surface. */
    far: StockSurface
}

export interface IStockStrategy {
    /**
     * Given an ordered list of per-board surface pairs (top board first),
     * return the flat list of StockSurfaces in fill order.
     */
    order(boards: BoardSurfacePair[]): StockSurface[]
}

/**
 * ArcStockStrategy
 *
 * Default strategy for arc shelf layouts.
 * Fills all Near faces top-to-bottom first, then all Far faces as overflow.
 * This gives a contiguous readable face before wrapping to the back side.
 *
 *   board[0].near, board[1].near, board[2].near,
 *   board[0].far,  board[1].far,  board[2].far
 */
export class ArcStockStrategy implements IStockStrategy {
    order(boards: BoardSurfacePair[]): StockSurface[] {
        return [
            ...boards.map(b => b.near),
            ...boards.map(b => b.far),
        ]
    }
}

/**
 * RowStockStrategy
 *
 * Strategy for row/grid shelf layouts where shelves face one direction only.
 * Fills Near faces only — no back side. In a row layout the shelf behind you
 * is a different unit facing the other aisle, not the back of this one.
 *
 *   board[0].near, board[1].near, board[2].near
 */
export class RowStockStrategy implements IStockStrategy {
    order(boards: BoardSurfacePair[]): StockSurface[] {
        return boards.map(b => b.near)
    }
}
