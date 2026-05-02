/**
 * SpokeLayoutUtils
 *
 * Shelf positions for the spoke layout.
 *
 * Geometry:
 * - Player starts at origin (0, 0, 0), central hub at origin
 * - Each spoke radiates outward from the hub at an evenly spaced angle
 * - Each spoke consists of two parallel shelf rows flanking a central aisle
 * - Shelf units face inward (Near surfaces face the aisle between the two rows)
 * - The hub area is intentionally left open — no shelves within hubClearanceMetres
 *
 * Section mapping:
 * - Each Section corresponds to one spoke
 * - Games fill the Near surfaces of both shelf rows interleaved by position along
 *   the spoke (slot 0 = left row pos 0, slot 1 = right row pos 0, slot 2 = left
 *   pos 1, ...) — see SpokeStockStrategy
 *
 * Stretch: mirrorWalkOrder — ascending on the right row, descending on the left,
 * so a player walking down the aisle sees games in continuous order regardless of
 * which side they're looking at. This is handled at the Section level (game
 * ordering in the list), not here in the geometry.
 */

import * as THREE from 'three'
import type { BoardSurfacePair, IStockStrategy } from './StockStrategy'
import type { StockSurface } from '../../../types/LayoutTypes'
import type { ISectionAwareLayoutDefinition } from './ILayoutDefinition'
import type { ShelfInfo, SectionShelfInfo, Section } from '../../../types/LayoutTypes'
import { AISLE_HALF_WIDTH_X } from './LayoutAisleWidths'

/**
 * SpokeStockStrategy
 *
 * Near-only per unit — the Far face of each spoke shelf faces away from the aisle.
 * Cross-row interleaving is a layout-level concern driven by ShelfReady emit order.
 *
 *   board[0].near, board[1].near, board[2].near
 */
export class SpokeStockStrategy implements IStockStrategy {
    order(boards: BoardSurfacePair[]): StockSurface[] {
        return boards.map(b => b.near)
    }
}

export interface SpokeLayoutConfig {
    /** Number of spokes (one per section). Default: 4. */
    spokeCount?: number
    /**
     * Angle offset for the first spoke in radians.
     * Default: -PI/2 + PI/8 — first spoke points slightly off -X so 4 spokes
     * land at 22.5°, 112.5°, 202.5°, 292.5° instead of cardinal 0/90/180/270.
     * This makes it obvious shelves are rotated relative to their aisles rather
     * than appearing stuck at 0° and 90°.
     */
    firstSpokeAngleOffset?: number
    /**
     * When true, default spoke angles avoid the central aisle axis (X=0 corridor)
        * by centering spoke gaps on the +Z/-Z axis. Explicit firstSpokeAngleOffset wins.
        * Default: derived from centerRunnerHalfWidthX > 0.
     */
    avoidCentralAisleAxis?: boolean
    /**
     * Distance from origin to the first shelf pair on each spoke (metres).
     * Should be large enough to leave a walkable open hub area. Default: 4.
     */
    hubClearanceMetres?: number
    /**
     * Number of shelf positions along each spoke. Default: 6.
     * Total shelves per spoke = shelvesPerSpoke * 2 (one per row).
     */
    shelvesPerSpoke?: number
    /**
     * Centre-to-centre distance between adjacent shelf positions along the spoke (metres).
     * Should be wide enough for comfortable side-by-side browsing. Default: 2.5.
     */
    shelfSpacingMetres?: number
    /**
     * Lateral offset from the spoke centreline to each shelf row (metres).
     * Shelf fronts (Near surfaces) face the aisle at this distance. Default: 1.8.
     */
    aisleHalfWidthMetres?: number
    /**
     * Half-width of the global entrance runner aisle on X (metres).
     * Shelves are shifted so |x| stays outside this corridor.
     * Default: 1.6.
     */
    centerRunnerHalfWidthX?: number
}

const DEFAULT_SPOKE_COUNT = 4
const DEFAULT_FIRST_SPOKE_ANGLE_OFFSET = -Math.PI / 2 + Math.PI / 8
const DEFAULT_HUB_CLEARANCE_METRES = 4
const DEFAULT_SHELVES_PER_SPOKE = 6
const DEFAULT_SHELF_SPACING_METRES = 2.5
const DEFAULT_AISLE_HALF_WIDTH_METRES = 1.8

const SPOKE_DEFAULTS: Required<SpokeLayoutConfig> = {
    spokeCount: DEFAULT_SPOKE_COUNT,
    firstSpokeAngleOffset: DEFAULT_FIRST_SPOKE_ANGLE_OFFSET,
    avoidCentralAisleAxis: true,
    hubClearanceMetres: DEFAULT_HUB_CLEARANCE_METRES,
    shelvesPerSpoke: DEFAULT_SHELVES_PER_SPOKE,
    shelfSpacingMetres: DEFAULT_SHELF_SPACING_METRES,
    aisleHalfWidthMetres: DEFAULT_AISLE_HALF_WIDTH_METRES,
    centerRunnerHalfWidthX: AISLE_HALF_WIDTH_X,
}

const DEFAULT_SHELF_HALF_WIDTH_X = 1.0

function enforceCenterRunnerAisleX(
    position: THREE.Vector3,
    halfWidth: number,
    shelfHalfWidthX: number,
    spokeDirX: number,
): THREE.Vector3 {
    if (halfWidth <= 0) {
        return position
    }

    const absX = Math.abs(position.x)
    const minimumShelfCenterAbsX = halfWidth + Math.max(0, shelfHalfWidthX)
    if (absX >= minimumShelfCenterAbsX) {
        return position
    }

    const dominantSide = Math.abs(position.x) > 0.0001
        ? Math.sign(position.x)
        : (Math.sign(spokeDirX) || 1)

    return new THREE.Vector3(dominantSide * minimumShelfCenterAbsX, position.y, position.z)
}

function deriveFirstSpokeAngleOffset(config: SpokeLayoutConfig, spokeCount: number): number {
    if (config.firstSpokeAngleOffset !== undefined) {
        return config.firstSpokeAngleOffset
    }

    const shouldAvoidCentralAisleAxis = config.avoidCentralAisleAxis
        ?? (config.centerRunnerHalfWidthX ?? 0) > 0

    if (!shouldAvoidCentralAisleAxis) {
        return SPOKE_DEFAULTS.firstSpokeAngleOffset
    }

    const angleStep = (2 * Math.PI) / Math.max(1, spokeCount)
    // Spokes are centered between +Z and -Z so the central aisle axis remains clear.
    return angleStep / 2
}

function deriveSpokeSpacingFromSectionCounts(
    spokePositionsPerSection: ReadonlyArray<number>,
    aisleHalfWidthMetres: number,
    minimumHubClearanceMetres: number
): { hubClearanceMetres: number; shelfSpacingMetres: number } {
    const maxPositionsInAnySection = Math.max(1, ...spokePositionsPerSection)

    const dynamicShelfSpacingMetres = Math.max(
        2.25,
        2.0 + maxPositionsInAnySection * 0.10
    )

    const dynamicHubClearanceMetres = Math.max(
        minimumHubClearanceMetres,
        aisleHalfWidthMetres * 2 + maxPositionsInAnySection * 0.06
    )

    return {
        hubClearanceMetres: dynamicHubClearanceMetres,
        shelfSpacingMetres: dynamicShelfSpacingMetres,
    }
}

export interface SpokeShelfInfo {
    position: THREE.Vector3
    /** Y rotation so shelf Near face faces the spoke aisle centreline. */
    rotationY: number
    /** Which spoke (0-based). */
    spokeIndex: number
    /** Position index along the spoke (0 = nearest to hub). */
    positionIndex: number
    /** Which row of the spoke pair. 'left' / 'right' relative to walking outward. */
    row: 'left' | 'right'
}

/**
 * Generate shelf positions for the spoke layout.
 *
 * Returns shelves ordered spoke-by-spoke, then by position along the spoke,
 * then left row before right row at each position. This ordering makes it
 * straightforward to interleave game placement across both rows (see
 * SpokeStockStrategy).
 */
export function computeSpokeShelfLayout(
    config: SpokeLayoutConfig = {}
): SpokeShelfInfo[] {
    const cfg = { ...SPOKE_DEFAULTS, ...config }
    const result: SpokeShelfInfo[] = []

    const angleStep = (2 * Math.PI) / cfg.spokeCount
    const firstSpokeAngleOffset = deriveFirstSpokeAngleOffset(cfg, cfg.spokeCount)

    for (let spokeIndex = 0; spokeIndex < cfg.spokeCount; spokeIndex++) {
        const spokeAngle = firstSpokeAngleOffset + spokeIndex * angleStep

        // Unit vector along the spoke (outward from hub)
        const spokeDir = new THREE.Vector3(Math.cos(spokeAngle), 0, Math.sin(spokeAngle))

        // Unit vector perpendicular to spoke (left of outward direction)
        const perpDir = new THREE.Vector3(-spokeDir.z, 0, spokeDir.x)

        for (let positionIndex = 0; positionIndex < cfg.shelvesPerSpoke; positionIndex++) {
            const distanceAlongSpoke = cfg.hubClearanceMetres + positionIndex * cfg.shelfSpacingMetres
            const centrePoint = spokeDir.clone().multiplyScalar(distanceAlongSpoke)

            for (const side of ['left', 'right'] as const) {
                const lateralSign = side === 'left' ? 1 : -1
                const shelfCentre = centrePoint.clone()
                    .addScaledVector(perpDir, lateralSign * cfg.aisleHalfWidthMetres)
                const adjustedShelfCentre = enforceCenterRunnerAisleX(
                    shelfCentre,
                    cfg.centerRunnerHalfWidthX,
                    DEFAULT_SHELF_HALF_WIDTH_X,
                    spokeDir.x,
                )

                // Shelf Near face must face the aisle (toward centreline).
                // Left row faces right (-perpDir), right row faces left (+perpDir).
                // atan2(x, z) gives the angle that makes the shelf's local +Z axis
                // (Near surface in our board model) point in facingDir.
                const facingDir = perpDir.clone().multiplyScalar(-lateralSign)
                const rotationY = Math.atan2(facingDir.x, facingDir.z)

                result.push({
                    position: adjustedShelfCentre,
                    rotationY,
                    spokeIndex,
                    positionIndex,
                    row: side,
                })
            }
        }
    }

    return result
}

function mapSpokeShelvesToShelfInfo(
    spokeShelves: ReturnType<typeof computeSpokeShelfLayout>,
    totalShelves: number
): ShelfInfo[] {
    return spokeShelves
        .slice(0, totalShelves)
        .map((s, i) => ({
            position: s.position,
            rotationY: s.rotationY,
            row: s.spokeIndex,
            indexInRow: i,
        }))
}

function computeSpokeShelvesByTotal(totalShelves: number): ShelfInfo[] {
    const defaultSpokeCount = SPOKE_DEFAULTS.spokeCount
    const shelvesPerSpokeNeeded = Math.max(
        SPOKE_DEFAULTS.shelvesPerSpoke,
        Math.ceil(totalShelves / (defaultSpokeCount * 2))
    )

    return mapSpokeShelvesToShelfInfo(
        computeSpokeShelfLayout({
            spokeCount: defaultSpokeCount,
            shelvesPerSpoke: shelvesPerSpokeNeeded,
            centerRunnerHalfWidthX: AISLE_HALF_WIDTH_X,
        }),
        totalShelves
    )
}

function computeSpokeShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[] {
    if (sections.length === 0) {
        return []
    }

    // Spoke shelves are consumed near-only (9 games per physical shelf).
    // Treat each spoke "position" (left+right pair) as the semantic unit for a
    // 18-game chunk, then expand to two physical shelves so aisles stay balanced.
    const spokePositionsPerSection = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const shelvesPerSection = spokePositionsPerSection.map(positionCount => positionCount * 2)
    const totalShelves = shelvesPerSection.reduce((sum, count) => sum + count, 0)

    // Keep spoke geometry keyed to section count so each section owns one spoke territory.
    const shelvesPerSpokeNeeded = Math.max(1, ...spokePositionsPerSection)

    const spokeCount = sections.length
    const baseAisleHalfWidth = SPOKE_DEFAULTS.aisleHalfWidthMetres

    const spacing = deriveSpokeSpacingFromSectionCounts(
        spokePositionsPerSection,
        baseAisleHalfWidth,
        SPOKE_DEFAULTS.hubClearanceMetres
    )

    // Ensure adjacent spokes don't physically overlap.
    // At the hub clearance radius, adjacent spoke centrelines are
    // 2 * hubClearance * sin(π/n) apart. Both aisles must fit between them
    // with at least 0.5m of breathing room per side.
    const MINIMUM_AISLE_CLEARANCE = 0.5
    const angularSeparation = spokeCount > 1 ? Math.sin(Math.PI / spokeCount) : 1
    const maxSafeAisleHalfWidth = Math.max(
        0.5,
        spacing.hubClearanceMetres * angularSeparation - MINIMUM_AISLE_CLEARANCE
    )
    const clampedAisleHalfWidth = Math.min(baseAisleHalfWidth, maxSafeAisleHalfWidth)

    const spokeShelves = computeSpokeShelfLayout({
        spokeCount,
        shelvesPerSpoke: shelvesPerSpokeNeeded,
        hubClearanceMetres: spacing.hubClearanceMetres,
        shelfSpacingMetres: spacing.shelfSpacingMetres,
        aisleHalfWidthMetres: clampedAisleHalfWidth,
        centerRunnerHalfWidthX: AISLE_HALF_WIDTH_X,
    })

    const sectionAwareShelves: SectionShelfInfo[] = []
    const sectionPlacedCount = new Array<number>(sections.length).fill(0)
    const sectionTargetCount = shelvesPerSection.map(count => count)

    for (const spokeShelf of spokeShelves) {
        const sectionIndex = spokeShelf.spokeIndex
        if (sectionIndex >= sections.length) {
            continue
        }
        if (sectionPlacedCount[sectionIndex] >= sectionTargetCount[sectionIndex]) {
            continue
        }

        sectionAwareShelves.push({
            position: spokeShelf.position,
            rotationY: spokeShelf.rotationY,
            row: spokeShelf.spokeIndex,
            indexInRow: sectionPlacedCount[sectionIndex],
            sectionIndex,
        })
        sectionPlacedCount[sectionIndex]++

        if (sectionAwareShelves.length >= totalShelves) {
            break
        }
    }

    return sectionAwareShelves
}

export const SpokeLayout: ISectionAwareLayoutDefinition = {
    mode: 'spoke',
    createStockStrategy: () => new SpokeStockStrategy(),
    computeShelves: (totalShelves): ShelfInfo[] => computeSpokeShelvesByTotal(totalShelves),
    computeShelvesForSections: (sections): SectionShelfInfo[] => computeSpokeShelvesForSections(sections),
}
