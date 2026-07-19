import { octaveNoise, noise2D, hexToRgb } from '../noise-utils'

export interface WoodPanelingOptions {
    numPlanks?: number
    ringFrequency?: number
    warpScale?: number
    warpStrength?: number
    fineGrainStrength?: number
    color1?: string
    color2?: string
    color3?: string
    edgeColor?: string
    seed?: number
}

export interface WoodPanelingNormalOptions {
    numPlanks?: number
    ringFrequency?: number
    warpScale?: number
    warpStrength?: number
    fineGrainStrength?: number
    seed?: number
    grainStrength?: number
    grooveDepth?: number
}

/**
 * Domain-warped grain value in [0,1]. The previous wood painters (wood-planks.ts,
 * wood-enhanced.ts) fed an UNWARPED `sin(y * frequency)` into the color ramp -- perfectly
 * straight, perfectly periodic bands, which reads as synthetic. Domain warping (perturb the
 * phase fed into the periodic function with noise, standard technique for wood/marble --
 * see iquilezles.org/articles/warp) makes the bands flow and waver organically instead.
 *
 * The warp noise is sampled mostly across X with only slow drift along Y, so bands bend
 * left-right as you look across the plank but stay coherent along its length -- matching
 * how real grain wanders without losing the "boardness" of a longitudinal grain pattern.
 */
function grainValue(x: number, y: number, ringFrequency: number, warpScale: number, warpStrength: number, fineGrainStrength: number, seed: number): number {
    const warp = octaveNoise(x * warpScale, y * warpScale * 0.15, 3, 0.5, 1) * warpStrength
               + octaveNoise(x * warpScale * 3.3 + seed, y * warpScale * 0.4, 2, 0.4, 1) * warpStrength * 0.35
    const bands = Math.sin((y + warp) * ringFrequency) * 0.5 + 0.5
    // Fine capillary grain -- short, higher-frequency streaks layered on top of the bands,
    // stretched along Y so they read as fine lines rather than blobs.
    const fine = octaveNoise(x * 0.18, y * 0.025 + seed, 3, 0.5, 1) * fineGrainStrength
    return Math.max(0, Math.min(1, bands + fine))
}

/**
 * Wood paneling diffuse texture -- vertical plank zones (same structure as the retired
 * wood-planks.ts: `numPlanks` horizontal bands in texture space, which become vertical
 * planks on the wall once the texture is rotated 90deg), each with its own tonal offset,
 * separated by darkened edge grooves. The grain itself is domain-warped (see grainValue)
 * instead of a plain sine wave.
 */
export function paintWoodPaneling(data: Uint8ClampedArray, width: number, height: number, opts: WoodPanelingOptions = {}): void {
    const numPlanks = opts.numPlanks ?? 4
    const ringFrequency = opts.ringFrequency ?? 0.15
    const warpScale = opts.warpScale ?? 0.02
    const warpStrength = opts.warpStrength ?? 18
    const fineGrainStrength = opts.fineGrainStrength ?? 0.12
    const color1 = opts.color1 ?? '#C89058'
    const color2 = opts.color2 ?? '#9C6530'
    const color3 = opts.color3 ?? '#5E3616'
    const edgeColor = opts.edgeColor ?? '#3A2010'
    const seed = opts.seed ?? 7
    const rgb1 = hexToRgb(color1)
    const rgb2 = hexToRgb(color2)
    const rgb3 = hexToRgb(color3)
    const edgeRgb = hexToRgb(edgeColor)
    const plankHeight = height / numPlanks

    for (let y = 0; y < height; y++) {
        const plankIndex = Math.floor(y / plankHeight)
        const plankLocalY = (y % plankHeight) / plankHeight
        const plankTone = noise2D(plankIndex * 11.7 + seed, 0.5) * 0.18
        const edgeT = Math.min(plankLocalY, 1 - plankLocalY)
        const edgeFactor = Math.min(1, edgeT / 0.035)

        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            const v = grainValue(x, y, ringFrequency, warpScale, warpStrength, fineGrainStrength, seed + plankIndex * 3.1)
            const vShifted = Math.max(0, Math.min(1, v + plankTone))

            let r: number, g: number, b: number
            if (vShifted < 0.5) {
                const f = vShifted * 2
                r = rgb1.r + (rgb2.r - rgb1.r) * f
                g = rgb1.g + (rgb2.g - rgb1.g) * f
                b = rgb1.b + (rgb2.b - rgb1.b) * f
            } else {
                const f = (vShifted - 0.5) * 2
                r = rgb2.r + (rgb3.r - rgb2.r) * f
                g = rgb2.g + (rgb3.g - rgb2.g) * f
                b = rgb2.b + (rgb3.b - rgb2.b) * f
            }
            r = r * edgeFactor + edgeRgb.r * (1 - edgeFactor)
            g = g * edgeFactor + edgeRgb.g * (1 - edgeFactor)
            b = b * edgeFactor + edgeRgb.b * (1 - edgeFactor)

            data[i] = Math.round(r); data[i + 1] = Math.round(g)
            data[i + 2] = Math.round(b); data[i + 3] = 255
        }
    }
}

/**
 * Normal map for wood paneling -- unlike the retired wood-normal.ts (a fixed `sin(x)` ripple
 * with no noise input, i.e. a perfectly uniform corrugation), this derives real relief from
 * the SAME domain-warped grain field as the diffuse, plus an actual V-groove depth dip at
 * each plank boundary (the previous version only darkened plank edges in color, with zero
 * actual depth -- planks read as flat-painted stripes, not physically separate boards).
 */
export function paintWoodPanelingNormal(data: Uint8ClampedArray, width: number, height: number, opts: WoodPanelingNormalOptions = {}): void {
    const numPlanks = opts.numPlanks ?? 4
    const ringFrequency = opts.ringFrequency ?? 0.15
    const warpScale = opts.warpScale ?? 0.02
    const warpStrength = opts.warpStrength ?? 18
    const fineGrainStrength = opts.fineGrainStrength ?? 0.12
    const seed = opts.seed ?? 7
    const grainStrength = opts.grainStrength ?? 1.2
    const grooveDepth = opts.grooveDepth ?? 6
    const plankHeight = height / numPlanks

    const heightAt = (px: number, py: number): number => {
        const wrappedY = ((py % height) + height) % height
        const plankIndex = Math.floor(wrappedY / plankHeight)
        const plankLocalY = (wrappedY % plankHeight) / plankHeight
        const grain = grainValue(px, wrappedY, ringFrequency, warpScale, warpStrength, fineGrainStrength, seed + plankIndex * 3.1) * grainStrength
        const edgeT = Math.min(plankLocalY, 1 - plankLocalY)
        const grooveBand = 0.02
        const groove = edgeT < grooveBand ? -(grooveBand - edgeT) / grooveBand * grooveDepth : 0
        return grain + groove
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
