import { noise2D, octaveNoise, hexToRgb } from '../noise-utils'

function carpetFiber(x: number, y: number, fiberDensity: number): number {
    const fiber1 = noise2D(x * fiberDensity * 0.5, y * fiberDensity * 2) * 0.5
    const fiber2 = noise2D(x * fiberDensity * 2, y * fiberDensity * 0.5) * 0.3
    const fiber3 = noise2D(x * fiberDensity * 4, y * fiberDensity * 4) * 0.2
    return fiber1 + fiber2 + fiber3
}

export interface CarpetEnhancedOptions {
    color?: string
    fiberDensity?: number
    roughness?: number
}

export function paintCarpetEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: CarpetEnhancedOptions = {}): void {
    const color = opts.color ?? '#8B0000'
    const fiberDensity = opts.fiberDensity ?? 0.4
    const roughness = opts.roughness ?? 0.8
    const rgb = hexToRgb(color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const fv = carpetFiber(x, y, fiberDensity)
            const cv = octaveNoise(x * 0.01, y * 0.01, 2, 0.6, 1) * 0.2
            const intensity = 1 + (fv + cv) * roughness
            data[i] = Math.max(0, Math.min(255, rgb.r * intensity))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g * intensity))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b * intensity))
            data[i + 3] = 255
        }
    }
}
