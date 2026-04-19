/**
 * StockStrategy
 *
 * Interface and shared types for the stocking strategy pattern.
 * Each layout's concrete strategy lives in its own utils file:
 *   ArcStockStrategy  → ArcLayoutUtils.ts
 *   RowStockStrategy  → RowLayoutUtils.ts
 *   SpokeStockStrategy → SpokeLayoutUtils.ts
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
