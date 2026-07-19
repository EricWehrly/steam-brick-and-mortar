import { octaveNoise, hexToRgb } from '../noise-utils'

export interface WallDrywallOptions {
    color?: string
    seed?: number
    cellsCoarse?: number
    cellsFine?: number
    radiusCoarse?: number
    radiusFine?: number
    minProminence?: number
    modulationScale?: number
    modulationMin?: number
    bumpHeight?: number
}

export interface WallDrywallNormalOptions {
    seed?: number
    cellsCoarse?: number
    cellsFine?: number
    radiusCoarse?: number
    radiusFine?: number
    minProminence?: number
    modulationScale?: number
    modulationMin?: number
    strength?: number
}

interface BumpFieldOptions {
    cellsCoarse: number
    cellsFine: number
    radiusCoarse: number
    radiusFine: number
    seed: number
    minProminence: number
    modulationScale: number
    modulationMin: number
}

/** Deterministic per-cell hash -> pseudo-random [0,1), used both to jitter a Worley feature
 *  point within its cell and (with a different seed offset) to give it a random prominence.
 *  No stored point array needed -- the hash IS the point. */
function cellHash(ix: number, iy: number, seed: number): number {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h = h ^ (h >>> 16)
    return ((h >>> 0) % 10000) / 10000
}

function cellJitter(ix: number, iy: number, seed: number): { x: number; y: number } {
    return { x: cellHash(ix, iy, seed), y: cellHash(ix, iy, seed + 1) }
}

/**
 * Worley/cellular "bump field" -- height is a function of distance to the nearest
 * randomly-scattered feature point (one per grid cell, checked against the 8 neighbors,
 * with cell indices wrapped for seamless tiling). Unlike Perlin/fBm noise -- smooth,
 * continuous, built from overlapping gradient waves -- Worley noise is built from discrete
 * scattered points, so it reads as separate bumps rather than flowing rivulets. This is the
 * standard technique for stucco/orange-peel/cellular textures.
 *
 * Falls off to exactly 0 ("flat wall") beyond `radiusCells` of the nearest point, so most of
 * the surface between bumps stays genuinely flat, not just low-amplitude noise everywhere.
 *
 * Each feature point also gets a random `prominence` in [minProminence, 1] -- without this,
 * a raw Worley field gives every bump the same height, which reads as a mechanical, uniform
 * lattice rather than organic roughness (a real wall has quiet patches and barely-there
 * grains mixed with slightly more visible ones, not a repeating pattern).
 */
function bumpField(u: number, v: number, cellsPerAxis: number, radiusCells: number, seed: number, minProminence: number): number {
    const cx = Math.floor(u)
    const cy = Math.floor(v)
    let minDist = Infinity
    let prominence = 1
    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const ix = (((cx + ox) % cellsPerAxis) + cellsPerAxis) % cellsPerAxis
            const iy = (((cy + oy) % cellsPerAxis) + cellsPerAxis) % cellsPerAxis
            const jitter = cellJitter(ix, iy, seed)
            const fx = cx + ox + jitter.x
            const fy = cy + oy + jitter.y
            const dx = u - fx
            const dy = v - fy
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < minDist) {
                minDist = dist
                prominence = minProminence + (1 - minProminence) * cellHash(ix, iy, seed + 500)
            }
        }
    }
    const t = Math.max(0, 1 - minDist / radiusCells)
    return t * t * (3 - 2 * t) * prominence // smoothstep -- a rounded bump profile, not a sharp cone
}

/**
 * Low-frequency Perlin modulation over the whole field -- broad, soft regions where the
 * bump texture reads quieter or busier, on top of the per-bump prominence variance above.
 * This is what breaks up a Worley field's tendency to look like a uniform, repeating
 * "wallpaper" pattern rather than genuinely irregular roughness.
 */
function regionalModulation(u: number, v: number, scale: number, modMin: number): number {
    const n = octaveNoise(u * scale, v * scale, 3, 0.5, 1) // roughly [-0.7, 0.7]
    const t = Math.max(0, Math.min(1, (n + 0.7) / 1.4))
    return modMin + (1 - modMin) * t
}

/** Two bump-field layers at different scales (varying bump size) combined and modulated by
 *  the regional field (varying overall prominence by area). */
function combinedBumps(u: number, v: number, opts: BumpFieldOptions): number {
    const coarse = bumpField(u * opts.cellsCoarse, v * opts.cellsCoarse, opts.cellsCoarse, opts.radiusCoarse, opts.seed, opts.minProminence)
    const fine   = bumpField(u * opts.cellsFine,   v * opts.cellsFine,   opts.cellsFine,   opts.radiusFine,   opts.seed + 97, opts.minProminence)
    const base = Math.min(1, coarse * 0.65 + fine * 0.4)
    return base * regionalModulation(u, v, opts.modulationScale, opts.modulationMin)
}

/**
 * Painted drywall diffuse texture -- mustard base with a subtle warm shade at each Worley
 * bump. `bumpHeight` scales overall prominence; the bump *shape* (discrete vs. flowing) and
 * *irregularity* (varying size/height, not a uniform lattice) are controlled by the field
 * construction above, not by these amplitude knobs.
 */
export function paintWallDrywall(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallOptions = {}): void {
    const color = opts.color ?? '#C4A052'
    const seed = opts.seed ?? 1337
    const cellsCoarse = opts.cellsCoarse ?? 90
    const cellsFine = opts.cellsFine ?? 220
    const radiusCoarse = opts.radiusCoarse ?? 0.4
    const radiusFine = opts.radiusFine ?? 0.35
    const minProminence = opts.minProminence ?? 0.15
    const modulationScale = opts.modulationScale ?? 3
    const modulationMin = opts.modulationMin ?? 0.25
    const bumpHeight = opts.bumpHeight ?? 1
    const rgb = hexToRgb(color)
    const fieldOpts: BumpFieldOptions = { cellsCoarse, cellsFine, radiusCoarse, radiusFine, seed, minProminence, modulationScale, modulationMin }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const h = combinedBumps(x / width, y / height, fieldOpts) * bumpHeight
            const shade = h * 13
            data[i]     = Math.max(0, Math.min(255, rgb.r + shade))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + shade * 0.85))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + shade * 0.6))
            data[i + 3] = 255
        }
    }
}

/** Normal map for painted drywall -- same bump field as the diffuse (so shading and shape
 *  align), derived via finite differences. `strength` controls prominence only. */
export function paintWallDrywallNormal(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallNormalOptions = {}): void {
    const seed = opts.seed ?? 1337
    const cellsCoarse = opts.cellsCoarse ?? 90
    const cellsFine = opts.cellsFine ?? 220
    const radiusCoarse = opts.radiusCoarse ?? 0.4
    const radiusFine = opts.radiusFine ?? 0.35
    const minProminence = opts.minProminence ?? 0.15
    const modulationScale = opts.modulationScale ?? 3
    const modulationMin = opts.modulationMin ?? 0.25
    const strength = opts.strength ?? 1.4
    const fieldOpts: BumpFieldOptions = { cellsCoarse, cellsFine, radiusCoarse, radiusFine, seed, minProminence, modulationScale, modulationMin }
    const heightAt = (px: number, py: number): number => combinedBumps(px / width, py / height, fieldOpts)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const dX = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength
            const dY = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength
            data[i]     = Math.floor((dX * 0.5 + 0.5) * 255)
            data[i + 1] = Math.floor((dY * 0.5 + 0.5) * 255)
            data[i + 2] = 255
            data[i + 3] = 255
        }
    }
}
