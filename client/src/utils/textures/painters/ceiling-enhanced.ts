import { octaveNoise, hexToRgb } from '../noise-utils'

export function paintCeilingEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: {
    color: string; bumpSize: number; density: number
}): void {
    const { bumpSize, density } = opts
    const rgb = hexToRgb(opts.color)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const bump = octaveNoise(x * density * 0.02, y * density * 0.02, 4, 0.5, 1)
            const detail = octaveNoise(x * density * 0.08, y * density * 0.08, 2, 0.3, 1) * 0.3
            const totalBump = (bump + detail) * bumpSize * 80
            data[i] = Math.max(0, Math.min(255, rgb.r + totalBump))
            data[i + 1] = Math.max(0, Math.min(255, rgb.g + totalBump))
            data[i + 2] = Math.max(0, Math.min(255, rgb.b + totalBump))
            data[i + 3] = 255
        }
    }
}
