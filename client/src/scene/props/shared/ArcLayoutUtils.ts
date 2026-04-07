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

const DEFAULTS: Omit<Required<ArcLayoutConfig>, 'shelvesPerRowByRow'> & Pick<ArcLayoutConfig, 'shelvesPerRowByRow'> = {
    rows: 5,
    shelvesPerRow: 4,
    rowRadiusStep: 4.0,
    firstRowRadius: 5.0,
    halfAngle: Math.PI / 3, // 60 deg each side
}

export interface ArcShelfInfo {
    position: THREE.Vector3
    /** Y rotation so shelf faces player origin (0,0,0). */
    rotationY: number
    row: number
    indexInRow: number
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
        const count = cfg.shelvesPerRowByRow?.[row] ?? cfg.shelvesPerRow

        for (let i = 0; i < count && shelfIndex < totalShelves; i++) {
            // Spread shelves evenly across the arc span
            const t = count === 1 ? 0 : (i / (count - 1)) - 0.5   // -0.5 .. +0.5
            const angle = t * 2 * cfg.halfAngle                     // -halfAngle .. +halfAngle

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