import { noise2D } from '../noise-utils'

export interface CarpetNormalOptions {
    /** 0–1: controls gradient steepness. Default 0.3. */
    intensity?: number
    /** Base pile height 0–1. Default 0.3. */
    pileHeight?: number
    /** Fiber height variation amplitude 0–1. Default 0.2. */
    fiberVariation?: number
}

/**
 * Generates a tangent-space normal map for carpet pile texture.
 *
 * Algorithm:
 *  1. Build a grayscale height field from pileHeight + noise octaves (fiber texture).
 *  2. For each texel, sample the Sobel cross (L/R/U/D) from the height field.
 *  3. Compute gradient → normal vector → normalize → pack into RGB (0–255).
 *
 * This is a direct port of CarpetNormalMapGenerator — no DOM, no Three.js.
 * OffscreenCanvas is NOT used; all computation is pure typed-array arithmetic.
 */
export function paintCarpetNormal(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    opts: CarpetNormalOptions = {}
): void {
    const intensity      = opts.intensity      ?? 0.3
    const pileHeight     = opts.pileHeight     ?? 0.3
    const fiberVariation = opts.fiberVariation ?? 0.2

    // ── Pass 1: build height field ────────────────────────────────────────────
    const heightField = new Float32Array(width * height)

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x

            // Three octaves of fiber noise, matching CarpetNormalMapGenerator
            let h = pileHeight
            h += noise2D(x * 0.1, y * 0.1) * fiberVariation * 0.5
            h += noise2D(x * 0.3, y * 0.3) * fiberVariation * 0.3
            h += noise2D(x * 0.8, y * 0.8) * fiberVariation * 0.2

            heightField[idx] = Math.max(0, Math.min(1, h))
        }
    }

    // ── Pass 2: Sobel gradient → normal → pack RGB ────────────────────────────
    const sample = (sx: number, sy: number): number => {
        sx = Math.max(0, Math.min(width  - 1, sx))
        sy = Math.max(0, Math.min(height - 1, sy))
        return heightField[sy * width + sx]
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4

            const gradX = (sample(x + 1, y) - sample(x - 1, y)) * intensity * 2.0
            const gradY = (sample(x, y + 1) - sample(x, y - 1)) * intensity * 2.0

            const nx = -gradX
            const ny = -gradY
            const nz = 1.0
            const inv = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz)

            data[i]     = Math.floor((nx * inv * 0.5 + 0.5) * 255)
            data[i + 1] = Math.floor((ny * inv * 0.5 + 0.5) * 255)
            data[i + 2] = Math.floor((nz * inv * 0.5 + 0.5) * 255)
            data[i + 3] = 255
        }
    }
}
