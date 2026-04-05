import { octaveNoise, hexToRgb } from '../noise-utils'

function woodGrainLinear(x: number, y: number, ringFrequency: number, grainStrength: number): number {
    // Lumber-like longitudinal grain: dominant variation across Y, subtle drift across X.
    // This avoids tree-ring cross-section appearance (radial circles).
    const baseLines = Math.sin(y * ringFrequency) * 0.5 + 0.5
    const alongGrainVariation = octaveNoise(x * 0.01, y * 0.05, 2, 0.3, 1) * 0.2
    const fineCrossGrain = octaveNoise(x * 0.08, y * 0.02, 3, 0.4, 1) * grainStrength
    return Math.max(0, Math.min(1, baseLines + alongGrainVariation + fineCrossGrain))
}

export interface WoodEnhancedOptions {
    grainStrength?: number
    ringFrequency?: number
    color1?: string
    color2?: string
    color3?: string
}

export function paintWoodEnhanced(data: Uint8ClampedArray, width: number, height: number, opts: WoodEnhancedOptions = {}): void {
    const grainStrength = opts.grainStrength ?? 0.4
    const ringFrequency = opts.ringFrequency ?? 0.08
    const color1 = opts.color1 ?? '#8B4513'
    const color2 = opts.color2 ?? '#A0522D'
    const color3 = opts.color3 ?? '#654321'
    const rgb1 = hexToRgb(color1)
    const rgb2 = hexToRgb(color2)
    const rgb3 = hexToRgb(color3)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const gv = woodGrainLinear(x, y, ringFrequency, grainStrength)
            const c1 = octaveNoise(x * 0.03, y * 0.03, 3, 0.5, 1) * 0.12
            const c2 = octaveNoise(x * 0.08, y * 0.08, 4, 0.4, 1) * 0.08
            const c3 = octaveNoise(x * 0.15, y * 0.15, 2, 0.3, 1) * 0.05
            const v = Math.max(0, Math.min(1, gv + c1 + c2 + c3))
            let r: number, g: number, b: number
            if (v < 0.5) {
                const f = v * 2
                r = rgb1.r + (rgb2.r - rgb1.r) * f
                g = rgb1.g + (rgb2.g - rgb1.g) * f
                b = rgb1.b + (rgb2.b - rgb1.b) * f
            } else {
                const f = (v - 0.5) * 2
                r = rgb2.r + (rgb3.r - rgb2.r) * f
                g = rgb2.g + (rgb3.g - rgb2.g) * f
                b = rgb2.b + (rgb3.b - rgb2.b) * f
            }
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
        }
    }
}
