// Brick color and mortar color are independently adjustable (brickColor / mortarColor) --
// generated once with these defaults; no live in-scene color control exists yet (that's the
// wall-material selector + color picker work, WS4 in the Phase 1 plan). Change these two
// values and regenerate to try a different brick/mortar combination in the meantime.
export const WALL_BRICK_DIFFUSE_OPTIONS = {
    width: 1024,
    height: 1024,
    brickColor: '#963C2E',
    mortarColor: '#B7AEA0',
    columns: 8,
    rows: 16,
    mortarFraction: 0.09,
    colorVariation: 0.14,
    seed: 42,
} as const

export const WALL_BRICK_NORMAL_OPTIONS = {
    width: 1024,
    height: 1024,
    columns: 8,
    rows: 16,
    mortarFraction: 0.09,
    mortarRecess: 5,
    faceRoughness: 0.5,
    seed: 42,
} as const
