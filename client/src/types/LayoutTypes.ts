/**
 * LayoutTypes
 *
 * Domain types for the layout pipeline: Layout → Sections → Sort → Placement.
 * These are data shapes, not events. Import from here when you need Section,
 * StockSurface, ShelfInfo, or LayoutMode without pulling in event definitions.
 *
 * Note: ILayoutDefinition lives in scene/props/shared/ILayoutDefinition.ts to
 * avoid a circular import chain (ILayoutDefinition → IStockStrategy → StockSurface → here).
 */

import * as THREE from 'three'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import type { GameSortMode } from './EnvironmentEvents'

/**
 * LayoutMode
 *
 * Identifies which macro-level shelf arrangement the store uses.
 * Player-selectable via the Layout dropdown in LayoutSortPanel.
 */
export const LayoutModes = {
    Arc:   'arc',
    Row:   'row',
    Spoke: 'spoke',
} as const

export type LayoutMode = typeof LayoutModes[keyof typeof LayoutModes]

/**
 * A named partition of games produced by grouping + sorting.
 *
 * Ungrouped layouts produce one section (name: '') containing all games.
 * Grouped layouts produce N sections, one per group (genre, tag, rating tier, etc.).
 *
 * Games in a section are already sorted. Spatial allocation is assigned later by
 * the layout system and is absent until SectionsReady fires.
 */
export interface Section {
    /** Human-readable label — used for sign placement. Empty string for ungrouped. */
    name: string
    /** Sorted games belonging to this section. */
    games: ReadonlyArray<Readonly<SteamGameData>>
    /** Which sort mode was applied within this section. */
    sortMode: GameSortMode
}

/**
 * StockSurface
 *
 * A single fillable face on a shelf board — the atomic unit of the stocking pipeline.
 *
 * Each physical shelf board has two faces (Near/Far). Instead of representing them as
 * one `ShelfSurface` with two sides, the layout pipeline splits them into independent
 * StockSurface entries. The ordering of the list determines fill priority; the
 * stocking strategy just iterates surfaces in order.
 *
 * All geometry is pre-resolved into world space so the spawner never needs
 * to know about ShelfFace, local Z offsets, or shelf rotation.
 */
export interface StockSurface {
    /** World-space position of the leftmost game slot center on this surface. */
    originPosition: THREE.Vector3
    /** World-space quaternion applied to every game box on this surface. */
    rotation: THREE.Quaternion
    /** Step vector from one game slot center to the next (world space). */
    slotStep: THREE.Vector3
    /** Maximum number of game slots on this surface. */
    capacity: number
}

/**
 * ShelfInfo
 *
 * Minimal shelf descriptor returned by all layout computers (computeShelves).
 * World-space position and rotation for a single shelf unit.
 */
export interface ShelfInfo {
    position: THREE.Vector3
    rotationY: number
    row: number
    indexInRow: number
}
