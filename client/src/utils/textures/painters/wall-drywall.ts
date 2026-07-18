import { octaveNoise, hexToRgb } from '../noise-utils'

export interface WallDrywallOptions {
    color?: string
    bumpDensity?: number
    bumpHeight?: number
    detailScale?: number
}

export interface WallDrywallNormalOptions {
    bumpDensity?: number
    detailScale?: number
    strength?: number
}

/**
 * Painted drywall diffuse texture. Same layered-noise structure as the popcorn
 * ceiling (ceiling-popcorn.ts) -- three noise bands spread across a wide frequency
 * range (base, detailScale x, detailScale*3 x) is what breaks up classic Perlin
 * noise's tendency to look like flowing streaks/rivulets rather than small round
 * bumps; a single or narrow-spread band (the previous version of this file) does
 * not have enough of that. Retuned from the ceiling for a much finer, subtler
 * "orange peel" read: higher bumpDensity (smaller bumps) and much lower bumpHeight
 * / color-shift amplitude, so the wall reads as solid/flat from normal viewing
 * distance and only shows texture up close.
 */
export function paintWallDrywall(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallOptions = {}): void {
    const color = opts.color ?? '#C4A052'
    const bumpDensity = opts.bumpDensity ?? 40
    const bumpHeight = opts.bumpHeight ?? 0.35
    const detailScale = opts.detailScale ?? 5
    const rgb = hexToRgb(color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const nx = (x / width) * bumpDensity
            const ny = (y / height) * bumpDensity
            const bump1 = octaveNoise(nx, ny, 3, 0.5, 1) * 0.6 + 0.4
            const bump2 = octaveNoise(nx * detailScale, ny * detailScale, 2, 0.4, 1) * 0.4
            const bump3 = octaveNoise(nx * detailScale * 3, ny * detailScale * 3, 1, 0.3, 1) * 0.15
            const h = Math.max(0, Math.min(1, (bump1 + bump2 + bump3) * bumpHeight))
            const warm = bump1 * 9
            data[i]     = Math.max(0, Math.min(255, rgb.r + h * 42 + warm))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + h * 36 + warm * 0.8))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + h * 24))
            data[i + 3] = 255
        }
    }
}

/**
 * Normal map for painted drywall -- same seamless coordinates as the diffuse, and
 * the same two-band structure as the popcorn ceiling's normal map, just at a much
 * lower strength (subtle orange peel, not popcorn-scale bumps).
 */
export function paintWallDrywallNormal(data: Uint8ClampedArray, width: number, height: number, opts: WallDrywallNormalOptions = {}): void {
    const bumpDensity = opts.bumpDensity ?? 40
    const detailScale = opts.detailScale ?? 5
    const strength = opts.strength ?? 4
    const heightAt = (px: number, py: number): number => {
        const nx = (px / width) * bumpDensity
        const ny = (py / height) * bumpDensity
        return octaveNoise(nx, ny, 3, 0.5, 1) * 0.6
             + octaveNoise(nx * detailScale, ny * detailScale, 2, 0.4, 1) * 0.4
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
