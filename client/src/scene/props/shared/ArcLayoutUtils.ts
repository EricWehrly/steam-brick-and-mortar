/**
 * ArcLayoutUtils
 *
 * Shelf positions for the concentric-arc (semicircle) layout.
 *
 * Geometry:
 * - Player stands at origin (0, 0, 0) facing -Z
 * - Shelves are arranged along arcs centred on the player origin
 * - Arc rows extend from directly in front and curve outward as they recede
 * - Shelves face inward (toward the player)
 *
 * Arc parameters are tuned so:
 * - The front row sits at a comfortable browsing distance
 * - Each successive row is a wider, deeper arc segment
 * - The total span stays within room width bounds
 */

import * as THREE from 'three'
import type { BoardSurfacePair, IStockStrategy } from './StockStrategy'
import type { StockSurface } from '../../../types/LayoutTypes'
import type { ISectionAwareLayoutDefinition } from './ILayoutDefinition'
import type { ShelfInfo, Section, SectionShelfInfo } from '../../../types/LayoutTypes'

/**
 * ArcStockStrategy
 *
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
export interface ArcLayoutConfig {
    /** Number of concentric arc rows. Default 5. */
    rows?: number
    /** Shelves per row (arc segment). Default 4. */
    shelvesPerRow?: number
    /** Radius increment per row (metres). Default 4. */
    rowRadiusStep?: number
    /** Radius of the first row (metres from player origin). Default 5. */
    firstRowRadius?: number
    /** Half-angle of the arc in radians. Default PI/3 (60 deg each side = 120 deg span). */
    halfAngle?: number
    /** Optional per-row half-angle overrides (radians). */
    halfAngleByRow?: number[]
    /** Physical width of one shelf unit in metres (used with minShelfGap). Default 2.0. */
    shelfWidthMetres?: number
    /**
     * Minimum centre-to-centre gap between adjacent shelves in a row (metres).
     * If set, the per-row shelf count is capped so no row violates this gap.
     * Row 0 always respects this; for the last row it is relaxed to allow the back wall.
     * Default: undefined (no enforcement).
     */
    minShelfGap?: number
    /**
     * Per-row shelf counts. If provided, overrides shelvesPerRow for each row index.
     * Allows outer rings to have more shelves than inner rings.
     * TD: inverted-layout - use this to implement the "wider-outer-ring" plan:
     *   front ring: 3 shelves (sparse, close), back rings: 6-8 (dense, far)
     *   combine with decreasing halfAngle toward front for the narrowing effect
     *   docs/roadmaps/tech-debt.md -> "Inverted arc layout"
     */
    shelvesPerRowByRow?: number[]
}

const DEFAULTS: Required<Pick<ArcLayoutConfig, 'rows' | 'shelvesPerRow' | 'rowRadiusStep' | 'firstRowRadius' | 'halfAngle'>> = {
    rows: 5,
    shelvesPerRow: 4,
    rowRadiusStep: 4.0,
    firstRowRadius: 5.0,
    halfAngle: Math.PI / 3, // 60 deg each side
}

function deriveArcConfigFromSectionCounts(sectionShelfCounts: ReadonlyArray<number>): ArcLayoutConfig {
    const maxShelvesInAnySection = Math.max(1, ...sectionShelfCounts)
    const totalShelves = sectionShelfCounts.reduce((sum, count) => sum + count, 0)

    return {
        rows: Math.max(5, Math.ceil(Math.sqrt(totalShelves / 3))),
        rowRadiusStep: Math.max(4.0, 3.8 + maxShelvesInAnySection * 0.06),
        firstRowRadius: Math.max(5.5, 4.8 + maxShelvesInAnySection * 0.03),
        halfAngle: Math.PI / 2.8,
        minShelfGap: 1.0,
        shelfWidthMetres: 2.0,
    }
}

export interface ArcShelfInfo {
    position: THREE.Vector3
    /** Y rotation so shelf faces player origin (0,0,0). */
    rotationY: number
    row: number
    indexInRow: number
}

/**
 * Maximum number of shelves that can fit in an arc row while keeping inter-shelf
 * chord distance >= shelfWidth + minGap.
 */
function maxShelvesForGap(radius: number, halfAngle: number, minGap: number, shelfWidth: number): number {
    for (let n = 40; n >= 2; n--) {
        const angleStep = (2 * halfAngle) / (n - 1)
        const chord = 2 * radius * Math.sin(angleStep / 2)
        if (chord >= shelfWidth + minGap) return n
    }
    return 1
}

/**
 * Generate shelf positions and orientations for a concentric-arc layout.
 * Returns positions in row-major order (all shelves of row 0, then row 1, etc).
 */
export function computeArcShelfLayout(
    totalShelves: number,
    config: ArcLayoutConfig = {}
): ArcShelfInfo[] {
    const cfg = { ...DEFAULTS, ...config }
    const result: ArcShelfInfo[] = []

    let shelfIndex = 0
    for (let row = 0; row < cfg.rows && shelfIndex < totalShelves; row++) {
        const radius = cfg.firstRowRadius + row * cfg.rowRadiusStep
        const rowHalfAngle = cfg.halfAngleByRow?.[row] ?? cfg.halfAngle
        let count = cfg.shelvesPerRowByRow?.[row] ?? cfg.shelvesPerRow

        // Enforce minimum walkable gap unless this is the last row (back wall)
        if (cfg.minShelfGap !== undefined && row < cfg.rows - 1) {
            const shelfWidth = cfg.shelfWidthMetres ?? 2.0
            const max = maxShelvesForGap(radius, rowHalfAngle, cfg.minShelfGap, shelfWidth)
            if (count > max) count = max
        }

        // Clamp to how many shelves we'll actually place in this row so the
        // placed shelves are centred at angle=0 rather than bunched to one side.
        const actualCount = Math.min(count, totalShelves - shelfIndex)

        for (let i = 0; i < count && shelfIndex < totalShelves; i++) {
            // Spread shelves evenly across the arc span, using actualCount for
            // spacing so a partial row stays centred (not left-justified).
            const t = actualCount === 1 ? 0 : (i / (actualCount - 1)) - 0.5   // -0.5 .. +0.5
            const angle = t * 2 * rowHalfAngle                     // -halfAngle .. +halfAngle

            // Arc is in the -Z half-space (in front of player)
            // angle = 0 means straight ahead (-Z axis), positive angle = left, negative = right
            const x = radius * Math.sin(angle)
            const z = -radius * Math.cos(angle)

            // Rotate shelf to face player origin (0, 0, 0)
            const facingAngle = Math.atan2(x, z)     // model front is -Z; rotate so -Z points toward origin
            const rotationY = facingAngle + Math.PI  // shelf front faces inward

            result.push({
                position: new THREE.Vector3(x, 0, z),
                rotationY,
                row,
                indexInRow: i,
            })
            shelfIndex++
        }
    }

    return result
}

/**
 * Tuned arc layout for the Steam Brick and Mortar store.
 *
 * Encapsulates the store-specific row/angle config so ShelfLayoutCoordinator
 * doesn't need to know the details. Call this instead of computeArcShelfLayout
 * directly when laying out the store.
 */
export const STORE_ARC_FIXED_ROWS_COUNT = 4 + 6 + 10 + 12 // 32 — rows 0–3 with fixed counts

export function computeStoreArcShelfLayout(totalShelves: number): ArcShelfInfo[] {
    const config: ArcLayoutConfig = {
        shelvesPerRowByRow: [
            4,
            6,
            10,
            12,
            Math.max(1, totalShelves - STORE_ARC_FIXED_ROWS_COUNT),
        ],
        halfAngleByRow: [
            Math.PI / 3.5,
            Math.PI / 3.5,
            Math.PI / 3,
            Math.PI / 3,
            Math.PI / 2.6,
        ],
        minShelfGap: 1.0,
        rowRadiusStep: 4.0,
        firstRowRadius: 5.5,
    }
    return computeArcShelfLayout(totalShelves, config)
}

function computeArcShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[] {
    if (sections.length === 0) {
        return []
    }

    const sectionShelfCounts = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const sectionRemainingCounts = [...sectionShelfCounts]
    const totalShelves = sectionShelfCounts.reduce((sum, count) => sum + count, 0)

    const dynamicArcConfig = deriveArcConfigFromSectionCounts(sectionShelfCounts)
    const shelves = computeArcShelfLayout(totalShelves, dynamicArcConfig)

    const shelvesByRow = new Map<number, number[]>()
    shelves.forEach((shelf, index) => {
        const entries = shelvesByRow.get(shelf.row) ?? []
        entries.push(index)
        shelvesByRow.set(shelf.row, entries)
    })

    const owningSectionIndices = new Array<number>(totalShelves).fill(0)
    let sectionCursor = 0

    for (const [, shelfIndices] of [...shelvesByRow.entries()].sort(([a], [b]) => a - b)) {
        for (const shelfIndex of shelfIndices) {
            let scanCount = 0
            while (scanCount < sectionRemainingCounts.length && sectionRemainingCounts[sectionCursor] <= 0) {
                sectionCursor = (sectionCursor + 1) % sectionRemainingCounts.length
                scanCount++
            }
            if (scanCount >= sectionRemainingCounts.length) {
                break
            }

            owningSectionIndices[shelfIndex] = sectionCursor
            sectionRemainingCounts[sectionCursor]--
            sectionCursor = (sectionCursor + 1) % sectionRemainingCounts.length
        }
    }

    return shelves.map((shelf, shelfIndex) => ({
        ...shelf,
        sectionIndex: owningSectionIndices[shelfIndex] ?? Math.min(sections.length - 1, shelfIndex % sections.length),
    }))
}

export const ArcLayout: ISectionAwareLayoutDefinition = {
    mode: 'arc',
    createStockStrategy: () => new ArcStockStrategy(),
    computeShelves: (totalShelves): ShelfInfo[] => computeStoreArcShelfLayout(totalShelves),
    computeShelvesForSections: (sections): SectionShelfInfo[] => computeArcShelvesForSections(sections),
}