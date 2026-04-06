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

function cellHash(ix: number, iy: number, seed: number): number {
    const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.3) * 43758.5453
    return n - Math.floor(n) // 0..1
}

/**
 * Popcorn ceiling diffuse texture.
 * Uses a jittered-grid cellular (Worley-like) granule approach for sharper,
 * more convincing ceiling bumps in VR.
 */
export function paintCeilingPopcorn(data: Uint8ClampedArray, width: number, height: number, opts: CeilingPopcornOptions = {}): void {
    const color = opts.color ?? '#E8E6D0'
    const bumpDensity = opts.bumpDensity ?? 40
    const bumpHeight = opts.bumpHeight ?? 1.4
    const detailScale = opts.detailScale ?? 5
    const rgb = hexToRgb(color)

    const GRID_N = bumpDensity
    const granuleRadius = 0.45

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const nx = x / width
            const ny = y / height

            // Scale to grid cells
            const gx = nx * GRID_N
            const gy = ny * GRID_N

            // Check 3x3 neighborhood of grid cells to find nearest granule
            // Wrap coordinates for seamless tiling
            let minDist = Infinity
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const cellX = Math.floor(gx) + di
                    const cellY = Math.floor(gy) + dj

                    // Hash with wrapped cell coordinates for tiling
                    const wrappedX = ((cellX % GRID_N) + GRID_N) % GRID_N
                    const wrappedY = ((cellY % GRID_N) + GRID_N) % GRID_N

                    const jx = cellHash(wrappedX, wrappedY, 0)
                    const jy = cellHash(wrappedX, wrappedY, 1)

                    const centerX = (cellX + jx) / GRID_N
                    const centerY = (cellY + jy) / GRID_N

                    const dx = nx - centerX
                    const dy = ny - centerY
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    minDist = Math.min(minDist, dist)
                }
            }

            // Convert distance to granule height profile
            const r = GRID_N * minDist // normalized distance to granule radius (0..1 within cell)
            let h = 0
            if (r < granuleRadius) {
                h = Math.cos((r / granuleRadius) * (Math.PI / 2)) // smooth dome
                h = h * h // steepen the dome
            }

            // Add micro-noise background stipple
            const micro = octaveNoise(nx * 80 * (detailScale / 5), ny * 80 * (detailScale / 5), 1, 0.5, 1) * 0.08
            const finalH = (h + micro) * bumpHeight

            const warm = h * 15
            data[i]     = Math.max(0, Math.min(255, rgb.r + finalH * 25 + warm))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + finalH * 22 + warm * 0.8))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + finalH * 15))
            data[i + 3] = 255
        }
    }
}

/**
 * Normal map for popcorn ceiling — same seamless coordinates as the diffuse.
 */
export function paintCeilingPopcornNormal(data: Uint8ClampedArray, width: number, height: number, opts: CeilingPopcornNormalOptions = {}): void {
    const bumpDensity = opts.bumpDensity ?? 40
    const detailScale = opts.detailScale ?? 5
    const strength = opts.strength ?? 40

    const GRID_N = bumpDensity
    const granuleRadius = 0.45

    const heightAt = (px: number, py: number): number => {
        const nx = px / width
        const ny = py / height

        const gx = nx * GRID_N
        const gy = ny * GRID_N

        let minDist = Infinity
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                const cellX = Math.floor(gx) + di
                const cellY = Math.floor(gy) + dj

                const wrappedX = ((cellX % GRID_N) + GRID_N) % GRID_N
                const wrappedY = ((cellY % GRID_N) + GRID_N) % GRID_N

                const jx = cellHash(wrappedX, wrappedY, 0)
                const jy = cellHash(wrappedX, wrappedY, 1)

                const centerX = (cellX + jx) / GRID_N
                const centerY = (cellY + jy) / GRID_N

                const dx = nx - centerX
                const dy = ny - centerY
                const dist = Math.sqrt(dx * dx + dy * dy)
                minDist = Math.min(minDist, dist)
            }
        }

        const r = GRID_N * minDist
        let h = 0
        if (r < granuleRadius) {
            h = Math.pow(Math.cos((r / granuleRadius) * (Math.PI / 2)), 2)
        }
        const micro = octaveNoise(nx * 80 * (detailScale / 5), ny * 80 * (detailScale / 5), 1, 0.5, 1) * 0.08
        return h + micro
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const dX = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength
            const dY = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength
            data[i]     = Math.max(0, Math.min(255, Math.floor((dX * 0.5 + 0.5) * 255)))
            data[i + 1] = Math.max(0, Math.min(255, Math.floor((dY * 0.5 + 0.5) * 255)))
            data[i + 2] = 255
            data[i + 3] = 255
        }
    }
}
