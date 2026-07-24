/**
 * Per-wall geometry mapping for wall posters: which room dimension each wall's slots run along,
 * which way a poster mounted there should face, and where a slot offset lands in room-local XZ.
 * Pure numbers, no THREE dependency, matching WallPosterLayout's testability convention.
 *
 * The front wall (glass storefront) is deliberately excluded - RoomManager's front wall is glass,
 * not a poster surface. Rotation values match RoomManager's own wall rotations exactly
 * (RoomManager.ts's ensureWalls) so a poster's front face ends up oriented the same way the
 * wall's own visible face already is.
 */

export interface RoomSpan {
    readonly width: number
    readonly depth: number
}

export interface WallTarget {
    readonly name: 'back' | 'left' | 'right'
    readonly rotationY: number
    span(dimensions: RoomSpan): number
    positionXZ(dimensions: RoomSpan, slotOffset: number, clearance: number): { x: number; z: number }
}

export const WALL_TARGETS: readonly WallTarget[] = [
    {
        name: 'back',
        rotationY: 0,
        span: dimensions => dimensions.width,
        positionXZ: (dimensions, slotOffset, clearance) => ({
            x: slotOffset,
            z: -dimensions.depth / 2 + clearance,
        }),
    },
    {
        name: 'left',
        rotationY: Math.PI / 2,
        span: dimensions => dimensions.depth,
        positionXZ: (dimensions, slotOffset, clearance) => ({
            x: -dimensions.width / 2 + clearance,
            z: slotOffset,
        }),
    },
    {
        name: 'right',
        rotationY: -Math.PI / 2,
        span: dimensions => dimensions.depth,
        positionXZ: (dimensions, slotOffset, clearance) => ({
            x: dimensions.width / 2 - clearance,
            z: slotOffset,
        }),
    },
]
