/**
 * StockStrategy
 *
 * Interface and shared types for the stocking strategy pattern.
 * Each layout's concrete strategy lives in its own utils file:
 *   ArcStockStrategy  → ArcLayoutUtils.ts
 *   RowStockStrategy  → RowLayoutUtils.ts
 *   SpokeStockStrategy → SpokeLayoutUtils.ts
 *
 * Also home to GameLayoutConstants and computeSlotsPerShelf: every layout utils
 * file needs these to derive its own shelf-count math, and this module has no
 * outgoing imports of its own, so it's a safe common ancestor — putting them in
 * GameBoxUtils.ts instead would cycle back through GameBoxUtils' existing
 * ArcStockStrategy import.
 */

import * as THREE from 'three'
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

// TD: approximated-placement-tripwire
// NOTE: Game positions are approximated from DEFAULT_SHELF_CONFIG (width, shelfCount, etc.).
// If shelf GLTF geometry changes, update GameBoxUtils.calculateGamePositions or
// run `test/unit/scene/placement-tripwire.test.ts` to validate positions don't
// float outside the modeled shelf. This is a deliberate tripwire to catch model-sync regressions.
export const GameLayoutConstants = {
    // Games per shelf board surface (front or back).
    // Intentionally low — readability over density. With 800 games, layout and FOV
    // constrain what's visible; we don't want to cram the shelves.
    GAMES_PER_SURFACE: 3,
    // Number of shelf board surfaces per shelf unit (3 boards × front+back = 6).
    SURFACES_PER_SHELF: 6,
    // Spacing between game box centers. Box width is 0.3m.
    // 0.55m gives comfortable spacing at VR scale — readable from player distance.
    GAME_SPACING: 0.55
} as const

/**
 * Total game slots one shelf unit offers under a given stocking strategy.
 *
 * Strategies differ in how many faces of each board they use (e.g. Arc fills
 * near+far, Row/Spoke fill near only), so slots-per-shelf isn't a fixed constant —
 * it depends on which layout is active. Mirrors the arithmetic
 * `GameBoxSpawner.placeSection` already applies at placement time
 * (`stockSurfaces.reduce((sum, s) => sum + s.capacity, 0)`), just run ahead of
 * placement so shelf-count allocation agrees with what placement will actually fill.
 */
export function computeSlotsPerShelf(strategy: IStockStrategy, boardCount: number): number {
    const dummySurface: StockSurface = {
        originPosition: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        slotStep: new THREE.Vector3(),
        capacity: GameLayoutConstants.GAMES_PER_SURFACE,
    }
    const boards: BoardSurfacePair[] = Array.from({ length: boardCount }, () => ({
        near: dummySurface,
        far: dummySurface,
    }))
    return strategy.order(boards).reduce((sum, surface) => sum + surface.capacity, 0)
}
