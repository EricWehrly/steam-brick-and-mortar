/**
 * ShelfFace identifies which side of a shelf board a game occupies.
 *
 * Named from the player's perspective, not the furniture's:
 *   Near — the inward-facing side the player sees (backZ = +0.5 local)
 *   Far  — the outward-facing side away from the player (frontZ = -0.5 local)
 */
export enum ShelfFace {
    Near = 'near',
    Far  = 'far',
}

export interface ShelfConfig {
    width?: number
    height?: number
    depth?: number
    angle?: number
    shelfCount?: number
    boardThickness?: number
    shelfExtensionPerLevel?: number
    shelfVerticalOffset?: number
}

export const DEFAULT_SHELF_CONFIG: Required<ShelfConfig> = {
    width: 2.0,
    height: 2.0,
    depth: 0.34,
    angle: 3,
    shelfCount: 3,
    boardThickness: 0.05,
    shelfExtensionPerLevel: 0.25,
    shelfVerticalOffset: -0.15
} as const

export interface ShelfSurface {
    topY: number
    frontZ: number
    backZ: number
    centerX: number
    width: number
}
