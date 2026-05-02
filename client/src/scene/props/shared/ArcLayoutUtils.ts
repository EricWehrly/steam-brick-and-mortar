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
    /** Half-angle of a central aisle interruption in radians. Default PI/18 (~10 deg). */
    centerAisleHalfAngle?: number
    /** Optional per-row central aisle half-angle overrides (radians). */
    centerAisleHalfAngleByRow?: number[]
    /**
     * Half-width of the center bisection corridor on X (metres).
     * If provided, rows reserve |x| < centerAisleHalfWidthX.
     */
    centerAisleHalfWidthX?: number
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

const DEFAULT_CENTER_AISLE_HALF_ANGLE = 0
const STORE_ROW_RADIUS_STEP_METRES = 4.0
const STORE_CENTER_AISLE_WIDTH_MULTIPLIER = 1.25
export const STORE_CENTER_AISLE_HALF_WIDTH_X = (STORE_ROW_RADIUS_STEP_METRES * STORE_CENTER_AISLE_WIDTH_MULTIPLIER) / 2
const ARC_ROW_SPREAD_SCALE = 0.8

function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t
}

function buildArcRowAngles(count: number, halfAngle: number, centerAisleHalfAngle: number): number[] {
    if (count <= 0) {
        return []
    }

    const usableHalfAngle = Math.max(0, Math.min(centerAisleHalfAngle, halfAngle - 0.01))

    if (count === 1) {
        return [usableHalfAngle > 0 ? usableHalfAngle : 0]
    }

    if (usableHalfAngle <= 0) {
        return Array.from({ length: count }, (_, index) => {
            if (count === 1) return 0
            const t = index / (count - 1)
            return lerp(-halfAngle, halfAngle, t)
        })
    }

    const leftCount = Math.ceil(count / 2)
    const rightCount = count - leftCount
    const angles: number[] = []

    for (let index = 0; index < leftCount; index++) {
        const t = leftCount === 1 ? 0.5 : index / (leftCount - 1)
        angles.push(lerp(-halfAngle, -usableHalfAngle, t))
    }

    for (let index = 0; index < rightCount; index++) {
        const t = rightCount === 1 ? 0.5 : index / (rightCount - 1)
        angles.push(lerp(usableHalfAngle, halfAngle, t))
    }

    return angles
}

function deriveCenterAisleHalfAngleForRow(
    radius: number,
    centerAisleHalfWidthX: number | undefined,
    fallbackHalfAngle: number
): number {
    if (!centerAisleHalfWidthX || centerAisleHalfWidthX <= 0 || radius <= 0) {
        return Math.max(0, fallbackHalfAngle)
    }

    const ratio = Math.min(0.99, centerAisleHalfWidthX / radius)
    const widthDerivedHalfAngle = Math.asin(ratio)
    return Math.max(widthDerivedHalfAngle, fallbackHalfAngle)
}

/**
 * Build a per-row shelf config so each section maps to a contiguous band of complete rings.
 *
 * Strategy:
 *  - Sections are expected to arrive sorted smallest → largest game count.
 *  - Each section claims as many rows as it needs, where each row holds as many
 *    shelves as can fit at that radius with the minimum walkable gap.
 *  - Row radius grows outward so inner rings (small sections) are tight and close;
 *    outer rings (large sections) are wide and further away.
 */
function buildRingBandsForSections(
    sectionShelfCounts: ReadonlyArray<number>
): {
    shelvesPerRowByRow: number[]
    halfAngleByRow: number[]
    rowOwnerByRow: number[]
    firstRowRadius: number
    rowRadiusStep: number
} {
    const FIRST_ROW_RADIUS = 5.5
    const ROW_RADIUS_STEP = STORE_ROW_RADIUS_STEP_METRES
    const HALF_ANGLE = (Math.PI / 3) * ARC_ROW_SPREAD_SCALE
    const MIN_GAP = 1.0
    const SHELF_WIDTH = 2.0

    const shelvesPerRowByRow: number[] = []
    const halfAngleByRow: number[] = []
    const rowOwnerByRow: number[] = []

    let currentRow = 0
    for (let sectionIndex = 0; sectionIndex < sectionShelfCounts.length; sectionIndex++) {
        let shelvesRemaining = sectionShelfCounts[sectionIndex]

        // Keep adding rows until this section's shelf budget is exhausted
        while (shelvesRemaining > 0) {
            const radius = FIRST_ROW_RADIUS + currentRow * ROW_RADIUS_STEP
            const capacity = maxShelvesForGap(radius, HALF_ANGLE, MIN_GAP, SHELF_WIDTH)
            const placed = Math.min(capacity, shelvesRemaining)

            shelvesPerRowByRow.push(placed)
            halfAngleByRow.push(HALF_ANGLE)
            rowOwnerByRow.push(sectionIndex)

            shelvesRemaining -= placed
            currentRow++
        }
    }

    return {
        shelvesPerRowByRow,
        halfAngleByRow,
        rowOwnerByRow,
        firstRowRadius: FIRST_ROW_RADIUS,
        rowRadiusStep: ROW_RADIUS_STEP,
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
        const rowCenterAisleHalfAngle = cfg.centerAisleHalfAngleByRow?.[row]
            ?? cfg.centerAisleHalfAngle
            ?? DEFAULT_CENTER_AISLE_HALF_ANGLE
        const effectiveCenterAisleHalfAngle = deriveCenterAisleHalfAngleForRow(
            radius,
            cfg.centerAisleHalfWidthX,
            rowCenterAisleHalfAngle
        )
        const rowAngles = buildArcRowAngles(actualCount, rowHalfAngle, effectiveCenterAisleHalfAngle)

        for (let i = 0; i < rowAngles.length && shelfIndex < totalShelves; i++) {
            const angle = rowAngles[i]

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
            (Math.PI / 3.5) * ARC_ROW_SPREAD_SCALE,
            (Math.PI / 3.5) * ARC_ROW_SPREAD_SCALE,
            (Math.PI / 3) * ARC_ROW_SPREAD_SCALE,
            (Math.PI / 3) * ARC_ROW_SPREAD_SCALE,
            (Math.PI / 2.6) * ARC_ROW_SPREAD_SCALE,
        ],
        minShelfGap: 1.0,
        rowRadiusStep: STORE_ROW_RADIUS_STEP_METRES,
        firstRowRadius: 5.5,
        centerAisleHalfWidthX: STORE_CENTER_AISLE_HALF_WIDTH_X,
    }
    return computeArcShelfLayout(totalShelves, config)
}

function computeArcShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[] {
    if (sections.length === 0) {
        return []
    }

    // Sort sections smallest → largest so the innermost ring holds the tightest group.
    // We preserve the original sectionIndex for sign/placement lookups.
    const indexedSections = sections.map((section, originalIndex) => ({ section, originalIndex }))
    const sortedSections = [...indexedSections].sort(
        (a, b) => a.section.games.length - b.section.games.length
    )

    const sortedShelfCounts = sortedSections.map(({ section }) =>
        Math.max(1, Math.ceil(section.games.length / 18))
    )

    const ringBands = buildRingBandsForSections(sortedShelfCounts)
    const totalShelves = ringBands.shelvesPerRowByRow.reduce((sum, n) => sum + n, 0)

    const shelves = computeArcShelfLayout(totalShelves, {
        rows: ringBands.shelvesPerRowByRow.length,
        shelvesPerRowByRow: ringBands.shelvesPerRowByRow,
        halfAngleByRow: ringBands.halfAngleByRow,
        firstRowRadius: ringBands.firstRowRadius,
        rowRadiusStep: ringBands.rowRadiusStep,
        minShelfGap: 1.0,
        shelfWidthMetres: 2.0,
        centerAisleHalfWidthX: STORE_CENTER_AISLE_HALF_WIDTH_X,
    })

    // Map each physical shelf back to its original (unsorted) section index
    // by tracking which row band belongs to which sorted section.
    let shelfCursor = 0
    const result: SectionShelfInfo[] = []

    for (let bandIndex = 0; bandIndex < ringBands.shelvesPerRowByRow.length; bandIndex++) {
        const sortedSectionIndex = ringBands.rowOwnerByRow[bandIndex]
        const originalSectionIndex = sortedSections[sortedSectionIndex].originalIndex
        const shelvesInRow = ringBands.shelvesPerRowByRow[bandIndex]

        for (let inRow = 0; inRow < shelvesInRow && shelfCursor < shelves.length; inRow++, shelfCursor++) {
            result.push({
                ...shelves[shelfCursor],
                sectionIndex: originalSectionIndex,
            })
        }
    }

    return result
}

export const ArcLayout: ISectionAwareLayoutDefinition = {
    mode: 'arc',
    createStockStrategy: () => new ArcStockStrategy(),
    computeShelves: (totalShelves): ShelfInfo[] => computeStoreArcShelfLayout(totalShelves),
    computeShelvesForSections: (sections): SectionShelfInfo[] => computeArcShelvesForSections(sections),
}