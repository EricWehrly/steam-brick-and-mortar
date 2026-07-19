export const MDF_VENEER_DIFFUSE_OPTIONS = {
    width: 1024,
    height: 1024,
    grainStrength: 0.3,
    ringFrequency: 0.01,
    color1: '#E6D3B7',
    color2: '#D4C4A0',
    color3: '#C8B896',
} as const

export const MDF_VENEER_NORMAL_OPTIONS = {
    width: 1024,
    height: 1024,
    strength: 0.06,
} as const

// Replaces the old wood_planks/wood_normal painters (plain sine-wave grain + a fixed sine
// normal ripple with no noise input at all -- see wood-paneling.ts for why that read as
// synthetic). "Honey oak" -- see WOOD_PANELING_WALNUT_* below for the darker alternative.
export const WALL_WOOD_DIFFUSE_OPTIONS = {
    width: 1024,
    height: 1024,
    numPlanks: 4,
    ringFrequency: 0.06,
    fineGrainStrength: 0.09,
    warpStrength: 26,
    warpScale: 0.012,
    color1: '#C89058',
    color2: '#9C6530',
    color3: '#5E3616',
    edgeColor: '#3A2010',
    seed: 7,
} as const

export const WALL_WOOD_NORMAL_OPTIONS = {
    width: 1024,
    height: 1024,
    numPlanks: 4,
    ringFrequency: 0.06,
    fineGrainStrength: 0.09,
    warpStrength: 26,
    warpScale: 0.012,
    seed: 7,
} as const

/** Darker alternative palette (walnut) -- same grain settings, different color1/2/3/edge. Not
 *  yet wired to a MaterialType/selector; kept here for when the wall-material picker (WS4)
 *  lands, or to swap in manually. */
export const WOOD_PANELING_WALNUT_DIFFUSE_OPTIONS = {
    ...WALL_WOOD_DIFFUSE_OPTIONS,
    color1: '#8B5A2B',
    color2: '#5C3A1E',
    color3: '#2E1B0E',
    edgeColor: '#1A0F08',
} as const
