import { octaveNoise, hexToRgb } from '../noise-utils'

export interface WallBrickOptions {
    brickColor?: string
    mortarColor?: string
    columns?: number
    rows?: number
    mortarFraction?: number
    colorVariation?: number
    pockmarkDensity?: number
    pockmarkGridScale?: number
    seed?: number
}

export interface WallBrickNormalOptions {
    columns?: number
    rows?: number
    mortarFraction?: number
    mortarRecess?: number
    faceRoughness?: number
    mortarRoughness?: number
    pockmarkDensity?: number
    pockmarkGridScale?: number
    pockmarkDepth?: number
    seed?: number
}

interface BrickCell {
    localX: number
    localY: number
    col: number
    row: number
}

/** Deterministic per-brick hash -> pseudo-random [0,1), for per-brick color variation and
 *  (with a different seed offset) pockmark placement/presence. */
function brickHash(col: number, row: number, seed: number): number {
    let h = (col * 374761393 + row * 668265263 + seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h = h ^ (h >>> 16)
    return ((h >>> 0) % 10000) / 10000
}

/**
 * Locates (u,v) within a running-bond brick grid: `rows` horizontal courses, `columns`
 * bricks per course, alternate courses offset by half a brick (the standard running-bond
 * pattern real brickwork uses -- a plain aligned grid reads as tile, not brick).
 */
function brickCellAt(u: number, v: number, columns: number, rows: number): BrickCell {
    const row = Math.floor(v * rows)
    const rowOffset = row % 2 === 1 ? 0.5 : 0
    const shiftedU = u * columns + rowOffset
    const col = Math.floor(shiftedU)
    const localX = shiftedU - col
    const localY = v * rows - row
    return { localX, localY, col, row }
}

/**
 * Smoothed [0,1] mask: 0 deep in a mortar joint, 1 on the brick face, with a soft transition
 * band at the joint edge (a hard step would alias badly in the derived normal map).
 */
function brickFaceMask(cell: BrickCell, mortarFraction: number): number {
    const distX = Math.min(cell.localX, 1 - cell.localX) - mortarFraction / 2
    const distY = Math.min(cell.localY, 1 - cell.localY) - mortarFraction / 2
    const edgeDist = Math.min(distX, distY)
    const transition = 0.015
    return Math.max(0, Math.min(1, (edgeDist + transition) / (2 * transition)))
}

/**
 * Sparse, randomly-scattered circular pockmarks on brick faces -- a real firing/manufacturing
 * imperfection, not present on every brick. Uses a fine sub-grid (gridScale cells per brick,
 * wrapped per-cell so it tiles) where each cell independently rolls whether it holds a mark
 * (`density`), so marks appear scattered rather than in a uniform grid. Returns [0,1]. 0 = no
 * mark at this point.
 */
function pockmarkField(u: number, v: number, columns: number, rows: number, gridScale: number, density: number, seed: number): number {
    const cellsX = columns * gridScale
    const cellsY = rows * gridScale
    const gx = u * cellsX
    const gy = v * cellsY
    const cx = Math.floor(gx)
    const cy = Math.floor(gy)
    let best = 0
    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const ix = cx + ox
            const iy = cy + oy
            if (brickHash(ix, iy, seed + 900) >= density) continue // this cell has no mark
            const jitterX = brickHash(ix, iy, seed + 901)
            const jitterY = brickHash(ix, iy, seed + 902)
            const radiusJitter = 0.3 + brickHash(ix, iy, seed + 903) * 0.5 // varying mark size
            const fx = ix + 0.2 + jitterX * 0.6 // keep marks away from cell edges
            const fy = iy + 0.2 + jitterY * 0.6
            const dx = gx - fx
            const dy = gy - fy
            const dist = Math.sqrt(dx * dx + dy * dy)
            const t = Math.max(0, 1 - dist / radiusJitter)
            const shaped = t * t * (3 - 2 * t)
            if (shaped > best) best = shaped
        }
    }
    return best
}

/**
 * Brick + mortar diffuse texture -- a running-bond grid (see brickCellAt) with independently
 * adjustable brick and mortar colors, per-brick random tint (hashed by row/column, so
 * individual bricks read as distinct rather than a uniformly-colored repeating stamp), sparse
 * pockmarks on brick faces, and fine noise texture on both faces and mortar.
 */
export function paintWallBrick(data: Uint8ClampedArray, width: number, height: number, opts: WallBrickOptions = {}): void {
    const brickRgb = hexToRgb(opts.brickColor ?? '#963C2E')
    const mortarRgb = hexToRgb(opts.mortarColor ?? '#B7AEA0')
    const columns = opts.columns ?? 8
    const rows = opts.rows ?? 16
    const mortarFraction = opts.mortarFraction ?? 0.09
    const colorVariation = opts.colorVariation ?? 0.14
    const pockmarkDensity = opts.pockmarkDensity ?? 0.35
    const pockmarkGridScale = opts.pockmarkGridScale ?? 2.5
    const seed = opts.seed ?? 42

    for (let y = 0; y < height; y++) {
        const v = y / height
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const u = x / width
            const cell = brickCellAt(u, v, columns, rows)
            const face = brickFaceMask(cell, mortarFraction)

            if (face > 0.5) {
                // Fine surface grain -- frequency chosen relative to actual pixel scale, not
                // brick scale, so it reads as texture, not a slow light/dark sweep across the
                // whole face (the previous 0.12 was under one full cycle per ~64px brick,
                // which is exactly what a visible half-light/half-dark split looks like).
                const fine = octaveNoise(x * 0.6, y * 0.6, 3, 0.5, 1)
                const mark = pockmarkField(u, v, columns, rows, pockmarkGridScale, pockmarkDensity, seed)
                const tint = (brickHash(cell.col, cell.row, seed) - 0.5) * 2 * colorVariation
                const shade = 1 + tint + fine * 0.05 - mark * 0.18
                data[i]     = Math.max(0, Math.min(255, brickRgb.r * shade))
                data[i + 1] = Math.max(0, Math.min(255, brickRgb.g * shade))
                data[i + 2] = Math.max(0, Math.min(255, brickRgb.b * shade))
            } else {
                const fine = octaveNoise(x * 0.5 + 137, y * 0.5, 3, 0.5, 1)
                const shade = 1 + fine * 0.09
                data[i]     = Math.max(0, Math.min(255, mortarRgb.r * shade))
                data[i + 1] = Math.max(0, Math.min(255, mortarRgb.g * shade))
                data[i + 2] = Math.max(0, Math.min(255, mortarRgb.b * shade))
            }
            data[i + 3] = 255
        }
    }
}

/**
 * Normal map for brick + mortar -- mortar joints are genuinely RECESSED (a real height dip,
 * not just a darker color); brick faces get fine noise-driven roughness plus sparse
 * pockmark divots; mortar gets its OWN fine roughness too (previously exactly flat --
 * `face` multiplied out any mortar-region height contribution entirely).
 */
export function paintWallBrickNormal(data: Uint8ClampedArray, width: number, height: number, opts: WallBrickNormalOptions = {}): void {
    const columns = opts.columns ?? 8
    const rows = opts.rows ?? 16
    const mortarFraction = opts.mortarFraction ?? 0.09
    const mortarRecess = opts.mortarRecess ?? 5
    const faceRoughness = opts.faceRoughness ?? 0.5
    const mortarRoughness = opts.mortarRoughness ?? 0.8
    const pockmarkDensity = opts.pockmarkDensity ?? 0.35
    const pockmarkGridScale = opts.pockmarkGridScale ?? 2.5
    const pockmarkDepth = opts.pockmarkDepth ?? 3.5
    const seed = opts.seed ?? 42

    const heightAt = (px: number, py: number): number => {
        const u = px / width
        const v = py / height
        const cell = brickCellAt(u, v, columns, rows)
        const face = brickFaceMask(cell, mortarFraction)

        // Fine roughness, sampled at pixel scale (not brick scale) on both faces -- same
        // frequency-choice fix as the diffuse painter.
        const faceNoise = octaveNoise(px * 0.6, py * 0.6, 2, 0.5, 1) * faceRoughness
        const mark = pockmarkField(u, v, columns, rows, pockmarkGridScale, pockmarkDensity, seed)
        const faceHeight = faceNoise - mark * pockmarkDepth

        const mortarNoise = octaveNoise(px * 0.5 + 137, py * 0.5, 2, 0.5, 1) * mortarRoughness

        return -mortarRecess + face * (mortarRecess + faceHeight) + (1 - face) * mortarNoise
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const dX = heightAt(x + 1, y) - heightAt(x - 1, y)
            const dY = heightAt(x, y + 1) - heightAt(x, y - 1)
            data[i]     = Math.floor((dX * 0.5 + 0.5) * 255)
            data[i + 1] = Math.floor((dY * 0.5 + 0.5) * 255)
            data[i + 2] = 255
            data[i + 3] = 255
        }
    }
}
