export interface WoodNormalOptions {
    strength?: number
}

export function paintWoodNormal(data: Uint8ClampedArray, width: number, height: number, opts: WoodNormalOptions = {}): void {
    const strength = opts.strength ?? 0.5
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const grainX = Math.sin(x * 0.02) * strength
            const nx = Math.cos(grainX) * 127 + 128
            const ny = Math.sin(grainX) * 127 + 128
            data[i] = Math.floor(nx)
            data[i + 1] = Math.floor(ny)
            data[i + 2] = 255
            data[i + 3] = 255
        }
    }
}
