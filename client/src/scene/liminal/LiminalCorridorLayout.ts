/**
 * LiminalCorridorLayout
 *
 * Liminal's own ILayoutDefinition — not a modifier wrapping Row. Corridor
 * geometry flows through the same SectionsReady -> ShelfReady ->
 * ShelfLayoutDetermined pipeline every other layout uses, so game-box
 * placement, room sizing, and raycasting need zero liminal-specific code.
 * See docs/plans/liminal-mode-plan.md, "Why the last attempt failed", for
 * why this replaces the previous move-the-world spike's post-hoc reposition
 * approach.
 *
 * Story 1 scope: a static, fixed-size corridor. No windowing or recycling
 * yet (Stories 3/5) — computeShelves ignores its argument and always
 * returns the same fixed set of units.
 *
 * Shape: two continuous lines of shelf units flanking one walkable aisle,
 * running parallel to the walk direction (-Z) rather than Row's transverse
 * rows spanning X. Units face inward, toward the aisle.
 */

import * as THREE from 'three'
import { AISLE_HALF_WIDTH_X } from '../props/shared/LayoutAisleWidths'
import { RowStockStrategy } from '../props/shared/RowLayoutUtils'
import type { ILayoutDefinition } from '../props/shared/ILayoutDefinition'
import type { IStockStrategy } from '../props/shared/StockStrategy'
import type { ShelfInfo } from '../../types/LayoutTypes'

const DEFAULT_SHELF_HALF_WIDTH_X = 1.0 // 2.0m shelf width / 2

/** Distance from the aisle centerline to a corridor unit's center. */
export const CORRIDOR_HALF_WIDTH_X = AISLE_HALF_WIDTH_X + DEFAULT_SHELF_HALF_WIDTH_X

/**
 * v1 window: fixed at 5 depth slots per side (10 shelf units total). At 9
 * slots/shelf (near-only stocking) that's ~90 games resident — deliberately
 * small so the whole corridor is visible without a far tier (see the
 * feature doc's "Projection / far tier (v1): None"). Re-tuned once real
 * windowing (Story 3) and recycling (Story 5) land — this is a render-budget
 * knob, not a perceptual distance threshold.
 */
export const LIMINAL_DEPTH_SLOTS = 5

/**
 * Center-to-center spacing between depth slots. A corridor unit's world-Z
 * footprint is its shelf *width* (2.0m) once rotated to face the aisle, not
 * its depth (0.34m) — so spacing needs to be close to unit width for the
 * corridor to read as continuous. Deliberately not flush (unit width, no
 * gap): per design decision, the aesthetic target is evocative of a
 * brick-and-mortar store, not a seam-to-seam replica of the reference
 * image. Tuned further, in the running app, in Story 6.
 */
export const CORRIDOR_UNIT_SPACING_Z = 2.6

/** Distance from the player's spawn point to the first (nearest) depth slot. */
export const CORRIDOR_FIRST_SLOT_OFFSET_Z = 4.0

export const LEFT_FACING_ROTATION_Y = Math.PI / 2   // faces +X, toward the aisle
export const RIGHT_FACING_ROTATION_Y = -Math.PI / 2 // faces -X, toward the aisle

export type CorridorSide = 'left' | 'right'

/**
 * World Z for a depth slot identified by its *rank* — a signed integer that
 * starts at the slot's physical index (0..LIMINAL_DEPTH_SLOTS-1) but, once
 * recycling starts (Story 5), can be any integer: a recycled unit's rank
 * jumps to one past the corridor's current far/near edge rather than
 * wrapping 0..LIMINAL_DEPTH_SLOTS-1, so the 5 physical units' ranks are
 * always LIMINAL_DEPTH_SLOTS consecutive integers, just not always 0..4.
 */
export function computeSlotWorldZ(rank: number): number {
    return -(CORRIDOR_FIRST_SLOT_OFFSET_Z + rank * CORRIDOR_UNIT_SPACING_Z)
}

export function computeUnitTransform(rank: number, side: CorridorSide): { position: THREE.Vector3; rotationY: number } {
    const z = computeSlotWorldZ(rank)
    return side === 'left'
        ? { position: new THREE.Vector3(-CORRIDOR_HALF_WIDTH_X, 0, z), rotationY: LEFT_FACING_ROTATION_Y }
        : { position: new THREE.Vector3(CORRIDOR_HALF_WIDTH_X, 0, z), rotationY: RIGHT_FACING_ROTATION_Y }
}

function computeLiminalCorridorShelves(): ShelfInfo[] {
    const shelves: ShelfInfo[] = []

    for (let slot = 0; slot < LIMINAL_DEPTH_SLOTS; slot++) {
        const left = computeUnitTransform(slot, 'left')
        const right = computeUnitTransform(slot, 'right')

        shelves.push({ position: left.position, rotationY: left.rotationY, row: slot, indexInRow: 0 })
        shelves.push({ position: right.position, rotationY: right.rotationY, row: slot, indexInRow: 1 })
    }

    return shelves
}

export const LiminalCorridorLayout: ILayoutDefinition = {
    mode: 'liminal',
    createStockStrategy: (): IStockStrategy => new RowStockStrategy(),
    computeShelves: (_totalShelves: number): ShelfInfo[] => computeLiminalCorridorShelves(),
}
