// 1024 (not 512) -- headroom to push cellsFine higher without aliasing (at 512px, 220 fine
// cells is only ~2.3px/cell, right at the noise floor; 1024px gives ~4.7px/cell).
export const WALL_DRYWALL_DIFFUSE_OPTIONS = {
    width: 1024,
    height: 1024,
    color: '#C4A052',
    seed: 1337,
    cellsCoarse: 90,
    cellsFine: 220,
    radiusCoarse: 0.4,
    radiusFine: 0.35,
    minProminence: 0.15,
    modulationScale: 3,
    modulationMin: 0.25,
    bumpHeight: 1,
} as const

export const WALL_DRYWALL_NORMAL_OPTIONS = {
    width: 1024,
    height: 1024,
    seed: 1337,
    cellsCoarse: 90,
    cellsFine: 220,
    radiusCoarse: 0.4,
    radiusFine: 0.35,
    minProminence: 0.15,
    modulationScale: 3,
    modulationMin: 0.25,
    strength: 1.4,
} as const

/**
 * Cold-start repeat, matching RoomConstants.DEFAULT_ROOM_WIDTH/DEPTH/HEIGHT and
 * WALL_TEXTURE_TILE_METERS. The room resizes at runtime to fit the library/shelf
 * count, so this is NOT the live source of truth -- RoomManager.ensureWalls()
 * recomputes and overwrites the actual repeat from real dimensions every time it
 * runs (which happens at least once before the user sees the wall). This value
 * only covers the brief window between texture creation and that first
 * dimension-aware update, so it's set to look correct at the default room size.
 */
export const WALL_DRYWALL_REPEAT = { x: 5.4, y: 1 } as const
