/**
 * RowLayoutUtils
 *
 * Shelf positions for a simple grid-row layout.
 *
 * Geometry:
 * - Player stands at origin (0, 0, 0) facing -Z
 * - Shelves are arranged in parallel rows along the X axis
 * - Each row extends left-to-right across the store width
 * - Shelves face forward (-Z direction, toward the player at origin)
 * - Rows recede away from the player along -Z
 *
 * This is the classic "video store" arrangement: walk down the aisle,
 * shelves to your left and right all face the same direction.
 */

import * as THREE from 'three'
import type { BoardSurfacePair, IStockStrategy } from './StockStrategy'
import type { StockSurface } from '../../../types/LayoutTypes'
import type { ISectionAwareLayoutDefinition } from './ILayoutDefinition'
import type { ShelfInfo, Section, SectionShelfInfo } from '../../../types/LayoutTypes'

/**
 * RowStockStrategy
 *
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

export interface RowLayoutConfig {
    /**
     * Number of shelf columns per row (left-to-right count).
     * Default: 8.
     */
    shelvesPerRow?: number
    /**
     * Centre-to-centre spacing between adjacent shelves in a row (metres).
     * Default: 2.5.
     */
    shelfSpacingX?: number
    /**
     * Centre-to-centre spacing between rows (depth, along -Z).
     * Default: 4.0.
     */
    rowSpacingZ?: number
    /**
     * Distance from origin to the first row (metres, along -Z).
     * Default: 4.0.
     */
    firstRowZ?: number
    /**
     * Maximum number of rows. Layout stops early if totalShelves is exhausted.
     * Default: 8.
     */
    maxRows?: number
}

const ROW_DEFAULTS: Required<RowLayoutConfig> = {
    shelvesPerRow: 8,
    shelfSpacingX: 2.5,
    rowSpacingZ: 4.0,
    firstRowZ: 4.0,
    maxRows: 8,
}

function deriveRowLayoutConfigFromSectionCounts(sections: ReadonlyArray<Section>): RowLayoutConfig {
    const sectionShelfCounts = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const maxShelvesInAnySection = Math.max(1, ...sectionShelfCounts)

    return {
        shelvesPerRow: Math.max(8, Math.ceil(Math.sqrt(maxShelvesInAnySection) * 3)),
        shelfSpacingX: Math.max(2.5, 2.2 + maxShelvesInAnySection * 0.02),
        rowSpacingZ: Math.max(4.0, 3.5 + maxShelvesInAnySection * 0.03),
        firstRowZ: ROW_DEFAULTS.firstRowZ,
        maxRows: Math.max(ROW_DEFAULTS.maxRows, Math.ceil(maxShelvesInAnySection / 2) + 2),
    }
}

export interface RowShelfInfo {
    position: THREE.Vector3
    /** Y rotation: 0 means shelf faces -Z (toward player at origin). */
    rotationY: number
    row: number
    indexInRow: number
}

/**
 * Generate shelf positions for the row layout.
 *
 * Returns shelves in row-major order (all shelves of row 0, then row 1, etc).
 * Within each row, shelves are ordered left-to-right (negative X to positive X),
 * centred on X=0.
 */
export function computeRowShelfLayout(
    totalShelves: number,
    config: RowLayoutConfig = {}
): RowShelfInfo[] {
    const cfg = { ...ROW_DEFAULTS, ...config }
    const result: RowShelfInfo[] = []
    let placed = 0

    for (let row = 0; row < cfg.maxRows && placed < totalShelves; row++) {
        const z = -(cfg.firstRowZ + row * cfg.rowSpacingZ)
        const actualCount = Math.min(cfg.shelvesPerRow, totalShelves - placed)
        const totalWidth = (cfg.shelvesPerRow - 1) * cfg.shelfSpacingX
        const startX = -totalWidth / 2

        for (let col = 0; col < actualCount; col++) {
            const x = startX + col * cfg.shelfSpacingX
            result.push({
                position: new THREE.Vector3(x, 0, z),
                rotationY: 0, // faces -Z, toward player
                row,
                indexInRow: col,
            })
            placed++
        }
    }

    return result
}

function computeRowShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[] {
    if (sections.length === 0) {
        return []
    }

    const shelvesPerSection = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const totalShelves = shelvesPerSection.reduce((sum, count) => sum + count, 0)
    const rowShelves = computeRowShelfLayout(totalShelves, deriveRowLayoutConfigFromSectionCounts(sections))

    const result: SectionShelfInfo[] = []
    let shelfIndex = 0
    for (let sectionIndex = 0; sectionIndex < shelvesPerSection.length; sectionIndex++) {
        const sectionShelfCount = shelvesPerSection[sectionIndex]
        for (let sectionShelfIndex = 0; sectionShelfIndex < sectionShelfCount && shelfIndex < rowShelves.length; sectionShelfIndex++, shelfIndex++) {
            result.push({
                ...rowShelves[shelfIndex],
                sectionIndex,
            })
        }
    }

    return result
}

export const RowLayout: ISectionAwareLayoutDefinition = {
    mode: 'row',
    createStockStrategy: () => new RowStockStrategy(),
    computeShelves: (totalShelves): ShelfInfo[] => computeRowShelfLayout(totalShelves),
    computeShelvesForSections: (sections): SectionShelfInfo[] => computeRowShelvesForSections(sections),
}
