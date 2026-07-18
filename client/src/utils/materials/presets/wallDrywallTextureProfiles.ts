export const WALL_DRYWALL_DIFFUSE_OPTIONS = {
    width: 512,
    height: 512,
    color: '#C4A052',
    bumpDensity: 40,
    bumpHeight: 0.35,
    detailScale: 5,
} as const

export const WALL_DRYWALL_NORMAL_OPTIONS = {
    width: 512,
    height: 512,
    bumpDensity: 40,
    detailScale: 5,
    strength: 4,
} as const

/**
 * Physical-scale tiling for the store's walls (back/front ~22m, left/right ~16m,
 * all ~3.5m tall -- see RoomConstants in RoomManager.ts). A single shared wall
 * material can't have a different repeat per wall, so this targets a tile that
 * reads roughly square across BOTH wall lengths rather than exactly matching
 * either: repeatY=1 spans the full ~3.5m wall height in one copy, and
 * repeatX~5.4 gives each tile ~4m width on the long walls / ~3m on the short
 * ones -- both close enough to square that the pattern doesn't visibly stretch
 * (the previous hardcoded 4x3 repeat stretched tiles by 3-5x on these walls).
 * Revisit if room size becomes dynamic (e.g. Room Variants).
 */
export const WALL_DRYWALL_REPEAT = { x: 5.4, y: 1 } as const
