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
     * Shelf fronts (Near surfaces) face the aisle at this distance. Default: 1.5.
     */
    aisleHalfWidthMetres?: number
}

const SPOKE_DEFAULTS: Required<SpokeLayoutConfig> = {
    spokeCount: 4,
    firstSpokeAngleOffset: -Math.PI / 2 + Math.PI / 8, // 22.5° bias off cardinal axes
    hubClearanceMetres: 4,
    shelvesPerSpoke: 6,
    shelfSpacingMetres: 2.5,
    aisleHalfWidthMetres: 1.5,
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

    for (let spokeIndex = 0; spokeIndex < cfg.spokeCount; spokeIndex++) {
        const spokeAngle = cfg.firstSpokeAngleOffset + spokeIndex * angleStep

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

                // Shelf Near face must face the aisle (toward centreline).
                // Left row faces right (-perpDir), right row faces left (+perpDir).
                // atan2(x, z) gives the angle that makes the +Z axis point in facingDir.
                // Add PI to flip so the shelf model's -Z front faces the aisle.
                const facingDir = perpDir.clone().multiplyScalar(-lateralSign)
                const rotationY = Math.atan2(facingDir.x, facingDir.z) + Math.PI

                result.push({
                    position: shelfCentre.clone(),
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
        }),
        totalShelves
    )
}

function computeSpokeShelvesForSections(sections: ReadonlyArray<Section>): SectionShelfInfo[] {
    if (sections.length === 0) {
        return []
    }

    const shelvesPerSection = sections.map(section => Math.max(1, Math.ceil(section.games.length / 18)))
    const totalShelves = shelvesPerSection.reduce((sum, count) => sum + count, 0)

    // Keep spoke geometry keyed to section count so each section owns one spoke territory.
    const shelvesPerSpokeNeeded = Math.max(
        1,
        Math.ceil(totalShelves / (sections.length * 2))
    )

    const spokeShelves = computeSpokeShelfLayout({
        spokeCount: sections.length,
        shelvesPerSpoke: shelvesPerSpokeNeeded,
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
