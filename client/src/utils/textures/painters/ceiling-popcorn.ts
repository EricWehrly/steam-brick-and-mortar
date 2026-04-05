import { octaveNoise, hexToRgb } from '../noise-utils'

export interface CeilingPopcornOptions {
    color?: string
    bumpDensity?: number
    bumpHeight?: number
    detailScale?: number
}

export interface CeilingPopcornNormalOptions {
    bumpDensity?: number
    detailScale?: number
    strength?: number
}

/**
 * Popcorn ceiling diffuse texture.
 * Tight, tile-safe bumps using fractional noise coordinates so the tile
 * wraps seamlessly. Higher bumpDensity = more, smaller bumps.
 */
export function paintCeilingPopcorn(data: Uint8ClampedArray, width: number, height: number, opts: CeilingPopcornOptions = {}): void {
    const color = opts.color ?? '#E8E6D0'
    const bumpDensity = opts.bumpDensity ?? 14
    const bumpHeight = opts.bumpHeight ?? 1.4
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
            const warm = bump1 * 8
            data[i]     = Math.max(0, Math.min(255, rgb.r + h * 25 + warm))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + h * 22 + warm * 0.8))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + h * 15))
            data[i + 3] = 255
        }
    }
}

/**
 * Normal map for popcorn ceiling — same seamless coordinates as the diffuse.
 */
export function paintCeilingPopcornNormal(data: Uint8ClampedArray, width: number, height: number, opts: CeilingPopcornNormalOptions = {}): void {
    const bumpDensity = opts.bumpDensity ?? 14
    const detailScale = opts.detailScale ?? 5
    const strength = opts.strength ?? 20
    const heightAt = (px: number, py: number): number => {
        const nx = (px / width)  * bumpDensity
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
