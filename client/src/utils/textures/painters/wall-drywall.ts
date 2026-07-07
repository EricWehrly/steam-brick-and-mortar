import { octaveNoise, hexToRgb } from '../noise-utils'

export interface WallDrywallOptions {
    color?: string
    mottleScale?: number
    mottleIntensity?: number
    peelDensity?: number
    peelHeight?: number
}

export interface WallDrywallNormalOptions {
    peelDensity?: number
    detailScale?: number
    strength?: number
}

/**
 * Painted drywall diffuse texture — mustard base with a low-frequency "mottle"
 * (broad, soft tonal patches, like uneven roller/sponge paint coverage) plus a
 * very fine, subtle orange-peel micro-texture. Same seamless fractional-noise
 * approach as ceiling-popcorn; the mottle term is what keeps flat paint from
 * reading as a dead, uniform box.
 */
export function paintWallDrywall(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallOptions = {}): void {
    const color = opts.color ?? '#C4A052'
    const mottleScale = opts.mottleScale ?? 3
    const mottleIntensity = opts.mottleIntensity ?? 18
    const peelDensity = opts.peelDensity ?? 48
    const peelHeight = opts.peelHeight ?? 0.5
    const rgb = hexToRgb(color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const mx = (x / width) * mottleScale
            const my = (y / height) * mottleScale
            const mottle = octaveNoise(mx, my, 3, 0.5, 1)

            const px = (x / width) * peelDensity
            const py = (y / height) * peelDensity
            const peel = octaveNoise(px, py, 2, 0.5, 1) * peelHeight

            const shade = mottle * mottleIntensity + peel * 6
            data[i]     = Math.max(0, Math.min(255, rgb.r + shade))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + shade * 0.92))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + shade * 0.75))
            data[i + 3] = 255
        }
    }
}

/**
 * Normal map for painted drywall — fine, shallow orange-peel bumps only
 * (no mottle contribution; mottle is a paint-color effect, not a height one).
 * Deliberately subtler than the popcorn ceiling normal.
 */
export function paintWallDrywallNormal(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallNormalOptions = {}): void {
    const peelDensity = opts.peelDensity ?? 48
    const detailScale = opts.detailScale ?? 2
    const strength = opts.strength ?? 4
    const heightAt = (px: number, py: number): number => {
        const nx = (px / width) * peelDensity
        const ny = (py / height) * peelDensity
        return octaveNoise(nx, ny, 2, 0.5, 1) * 0.5
             + octaveNoise(nx * detailScale, ny * detailScale, 2, 0.4, 1) * 0.3
    }
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
