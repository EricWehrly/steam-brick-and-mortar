import { hexToRgb } from '../noise-utils'

export interface WallDrywallOptions {
    color?: string
    seed?: number
    cellsCoarse?: number
    cellsFine?: number
    radiusCoarse?: number
    radiusFine?: number
    bumpHeight?: number
}

export interface WallDrywallNormalOptions {
    seed?: number
    cellsCoarse?: number
    cellsFine?: number
    radiusCoarse?: number
    radiusFine?: number
    strength?: number
}

interface BumpFieldOptions {
    cellsCoarse: number
    cellsFine: number
    radiusCoarse: number
    radiusFine: number
    seed: number
}

/** Deterministic per-cell hash -> pseudo-random [0,1) offset, used to jitter a Worley/cellular
 *  feature point within its grid cell. No stored point array needed -- the hash IS the point. */
function cellJitter(ix: number, iy: number, seed: number): { x: number; y: number } {
    let hx = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0
    hx = Math.imul(hx ^ (hx >>> 13), 1274126177)
    hx = hx ^ (hx >>> 16)
    let hy = (ix * 1274126177 + iy * 374761393 + seed * 3266489917) | 0
    hy = Math.imul(hy ^ (hy >>> 13), 668265263)
    hy = hy ^ (hy >>> 16)
    return { x: ((hx >>> 0) % 10000) / 10000, y: ((hy >>> 0) % 10000) / 10000 }
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
 */
function bumpField(u: number, v: number, cellsPerAxis: number, radiusCells: number, seed: number): number {
    const cx = Math.floor(u)
    const cy = Math.floor(v)
    let minDist = Infinity
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
            if (dist < minDist) minDist = dist
        }
    }
    const t = Math.max(0, 1 - minDist / radiusCells)
    return t * t * (3 - 2 * t) // smoothstep -- a rounded bump profile, not a sharp cone
}

/** Two bump-field layers at different scales, combined for bumps of varying size (a single
 *  layer gives uniform-looking bumps; real orange-peel/stucco has a mix of small and large). */
function combinedBumps(u: number, v: number, opts: BumpFieldOptions): number {
    const coarse = bumpField(u * opts.cellsCoarse, v * opts.cellsCoarse, opts.cellsCoarse, opts.radiusCoarse, opts.seed)
    const fine   = bumpField(u * opts.cellsFine,   v * opts.cellsFine,   opts.cellsFine,   opts.radiusFine,   opts.seed + 97)
    return Math.min(1, coarse * 0.7 + fine * 0.45)
}

/**
 * Painted drywall diffuse texture -- mustard base with a subtle warm shade at each Worley
 * bump. `bumpHeight` scales overall prominence; the bump *shape* (discrete vs. flowing) is
 * controlled by the field construction above, not by these amplitude knobs.
 */
export function paintWallDrywall(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallOptions = {}): void {
    const color = opts.color ?? '#C4A052'
    const seed = opts.seed ?? 1337
    const cellsCoarse = opts.cellsCoarse ?? 60
    const cellsFine = opts.cellsFine ?? 140
    const radiusCoarse = opts.radiusCoarse ?? 0.4
    const radiusFine = opts.radiusFine ?? 0.35
    const bumpHeight = opts.bumpHeight ?? 1
    const rgb = hexToRgb(color)
    const fieldOpts: BumpFieldOptions = { cellsCoarse, cellsFine, radiusCoarse, radiusFine, seed }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const h = combinedBumps(x / width, y / height, fieldOpts) * bumpHeight
            const shade = h * 22
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
    const cellsCoarse = opts.cellsCoarse ?? 60
    const cellsFine = opts.cellsFine ?? 140
    const radiusCoarse = opts.radiusCoarse ?? 0.4
    const radiusFine = opts.radiusFine ?? 0.35
    const strength = opts.strength ?? 2.5
    const fieldOpts: BumpFieldOptions = { cellsCoarse, cellsFine, radiusCoarse, radiusFine, seed }
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
