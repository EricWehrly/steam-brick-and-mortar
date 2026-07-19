import { octaveNoise, hexToRgb } from '../noise-utils'

export interface WallBrickOptions {
    brickColor?: string
    mortarColor?: string
    columns?: number
    rows?: number
    mortarFraction?: number
    colorVariation?: number
    seed?: number
}

export interface WallBrickNormalOptions {
    columns?: number
    rows?: number
    mortarFraction?: number
    mortarRecess?: number
    faceRoughness?: number
    seed?: number
}

interface BrickCell {
    localX: number
    localY: number
    col: number
    row: number
}

/** Deterministic per-brick hash -> pseudo-random [0,1), for per-brick color variation. */
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
 * Brick + mortar diffuse texture -- a running-bond grid (see brickCellAt) with independently
 * adjustable brick and mortar colors, per-brick random tint (hashed by row/column, so
 * individual bricks read as distinct rather than a uniformly-colored repeating stamp), and
 * fine noise texture on both brick faces and mortar for surface variation.
 */
export function paintWallBrick(data: Uint8ClampedArray, width: number, height: number, opts: WallBrickOptions = {}): void {
    const brickRgb = hexToRgb(opts.brickColor ?? '#963C2E')
    const mortarRgb = hexToRgb(opts.mortarColor ?? '#B7AEA0')
    const columns = opts.columns ?? 8
    const rows = opts.rows ?? 16
    const mortarFraction = opts.mortarFraction ?? 0.09
    const colorVariation = opts.colorVariation ?? 0.14
    const seed = opts.seed ?? 42

    for (let y = 0; y < height; y++) {
        const v = y / height
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const u = x / width
            const cell = brickCellAt(u, v, columns, rows)
            const face = brickFaceMask(cell, mortarFraction)

            const fineNoise = octaveNoise(x * 0.12, y * 0.12, 3, 0.5, 1)

            if (face > 0.5) {
                const tint = (brickHash(cell.col, cell.row, seed) - 0.5) * 2 * colorVariation
                const shade = 1 + tint + fineNoise * 0.06
                data[i]     = Math.max(0, Math.min(255, brickRgb.r * shade))
                data[i + 1] = Math.max(0, Math.min(255, brickRgb.g * shade))
                data[i + 2] = Math.max(0, Math.min(255, brickRgb.b * shade))
            } else {
                const shade = 1 + fineNoise * 0.05
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
 * not just a darker color), which is the dimensional cue that reads as "brick" under angled
 * light; brick faces get a light noise-driven roughness on top so they aren't perfectly flat.
 */
export function paintWallBrickNormal(data: Uint8ClampedArray, width: number, height: number, opts: WallBrickNormalOptions = {}): void {
    const columns = opts.columns ?? 8
    const rows = opts.rows ?? 16
    const mortarFraction = opts.mortarFraction ?? 0.09
    const mortarRecess = opts.mortarRecess ?? 5
    const faceRoughness = opts.faceRoughness ?? 0.5
    const seed = opts.seed ?? 42

    const heightAt = (px: number, py: number): number => {
        const u = px / width
        const v = py / height
        const cell = brickCellAt(u, v, columns, rows)
        const face = brickFaceMask(cell, mortarFraction)
        const roughness = (octaveNoise(px * 0.2, py * 0.2, 2, 0.5, seed) ) * faceRoughness
        return -mortarRecess + face * (mortarRecess + roughness)
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
