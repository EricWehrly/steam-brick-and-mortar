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
 * - Shelf traversal starts at the central aisle edge and moves outward toward the walls
 *
 * This is the classic "video store" arrangement: walk down the aisle,
 * shelves to your left and right all face the same direction.
 */

import * as THREE from 'three'
import type { BoardSurfacePair, IStockStrategy } from './StockStrategy'
import type { StockSurface } from '../../../types/LayoutTypes'
import type { ISectionAwareLayoutDefinition } from './ILayoutDefinition'
import type { ShelfInfo, Section, SectionShelfInfo } from '../../../types/LayoutTypes'
import { AISLE_WIDTH_X } from './LayoutAisleWidths'
import { assignSectionsByBalancedXAxisRegions } from './BalancedSectionAllocator'

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
    /**
     * Width of the central walkable aisle (metres, along X).
     * Shelf centres are shifted away from X=0 to preserve this gap.
     * Default: 3.0.
     */
    centralAisleWidthX?: number
}

const ROW_DEFAULTS: Required<RowLayoutConfig> = {
    shelvesPerRow: 8,
    shelfSpacingX: 2.5,
    rowSpacingZ: 4.0,
    firstRowZ: 4.0,
    maxRows: 8,
    centralAisleWidthX: AISLE_WIDTH_X,
}

function ensureEven(count: number): number {
    return count % 2 === 0 ? count : count + 1
}

function computeAisleShiftedX(
    colIndex: number,
    shelvesPerRow: number,
    shelfSpacingX: number,
    centralAisleWidthX: number
): number {
    const totalWidth = (shelvesPerRow - 1) * shelfSpacingX
    const baseX = -totalWidth / 2 + colIndex * shelfSpacingX
    const aisleHalfWidth = centralAisleWidthX / 2

    if (baseX < 0) {
        return baseX - aisleHalfWidth
    }
    if (baseX > 0) {
        return baseX + aisleHalfWidth
    }
    return baseX - aisleHalfWidth
}

function buildAisleOutwardTraversalColumns(
    actualCount: number,
    startCol: number,
    shelvesPerRow: number,
    shelfSpacingX: number,
    centralAisleWidthX: number
): number[] {
    return Array.from({ length: actualCount }, (_, offset) => startCol + offset)
        .sort((leftColumn, rightColumn) => {
            const leftX = computeAisleShiftedX(leftColumn, shelvesPerRow, shelfSpacingX, centralAisleWidthX)
            const rightX = computeAisleShiftedX(rightColumn, shelvesPerRow, shelfSpacingX, centralAisleWidthX)
            const distanceDifference = Math.abs(leftX) - Math.abs(rightX)

            if (Math.abs(distanceDifference) > 0.0001) {
                return distanceDifference
            }

            return leftX - rightX
        })
}

function deriveRowLayoutConfigFromSectionCounts(sections: ReadonlyArray<Section>): RowLayoutConfig {
    const sectionShelfCounts = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const maxShelvesInAnySection = Math.max(1, ...sectionShelfCounts)
    const dynamicShelvesPerRow = Math.max(8, Math.ceil(Math.sqrt(maxShelvesInAnySection) * 2.6))

    return {
        shelvesPerRow: ensureEven(dynamicShelvesPerRow),
        shelfSpacingX: Math.max(2.5, 2.2 + maxShelvesInAnySection * 0.015),
        rowSpacingZ: Math.max(4.0, 3.5 + maxShelvesInAnySection * 0.02),
        firstRowZ: ROW_DEFAULTS.firstRowZ,
        maxRows: Math.max(ROW_DEFAULTS.maxRows, Math.ceil(maxShelvesInAnySection / 2) + 2),
        centralAisleWidthX: ROW_DEFAULTS.centralAisleWidthX,
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
 * Within each row, shelves are ordered from the aisle outward so sequence-driven
 * layouts begin at the corridor and expand toward the store walls on both sides.
 */
export function computeRowShelfLayout(
    totalShelves: number,
    config: RowLayoutConfig = {}
): RowShelfInfo[] {
    const cfg = { ...ROW_DEFAULTS, ...config }
    const shelvesPerRow = ensureEven(Math.max(2, cfg.shelvesPerRow))
    const result: RowShelfInfo[] = []
    let placed = 0

    for (let row = 0; row < cfg.maxRows && placed < totalShelves; row++) {
        const z = -(cfg.firstRowZ + row * cfg.rowSpacingZ)
        const actualCount = Math.min(shelvesPerRow, totalShelves - placed)
        const startCol = Math.floor((shelvesPerRow - actualCount) / 2)
        const traversalColumns = buildAisleOutwardTraversalColumns(
            actualCount,
            startCol,
            shelvesPerRow,
            cfg.shelfSpacingX,
            cfg.centralAisleWidthX
        )

        for (let indexInRow = 0; indexInRow < traversalColumns.length; indexInRow++) {
            const col = traversalColumns[indexInRow]
            const x = computeAisleShiftedX(
                col,
                shelvesPerRow,
                cfg.shelfSpacingX,
                cfg.centralAisleWidthX
            )
            result.push({
                position: new THREE.Vector3(x, 0, z),
                rotationY: 0, // faces -Z, toward player
                row,
                indexInRow,
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
    const sectionByShelfIndex = assignSectionsByBalancedXAxisRegions(rowShelves, shelvesPerSection)

    return rowShelves.map((shelf, shelfIndex) => ({
        ...shelf,
        sectionIndex: sectionByShelfIndex[shelfIndex] ?? 0,
    }))
}

export const RowLayout: ISectionAwareLayoutDefinition = {
    mode: 'row',
    createStockStrategy: () => new RowStockStrategy(),
    computeShelves: (totalShelves): ShelfInfo[] => computeRowShelfLayout(totalShelves),
    computeShelvesForSections: (sections): SectionShelfInfo[] => computeRowShelvesForSections(sections),
}
