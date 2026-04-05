import { noise2D, octaveNoise, hexToRgb } from '../noise-utils'

/**
 * Wood paneling with distinct plank zones.
 * Each plank is a horizontal band in texture space. Since this texture is applied
 * with rotation=PI/2 in Three.js (to make planks run vertically on walls), the
 * Y axis in texture space maps to horizontal on the wall.
 *
 * numPlanks:      how many plank zones per tile
 * grainFrequency: fine grain line frequency within each plank
 * grainStrength:  amplitude of grain variation (keep low for subtlety)
 * baseColors:     array of hex colors cycling across planks (each slightly different)
 * edgeColor:      gap/shadow color between planks
 */
export function paintWoodPlanks(data: Uint8ClampedArray, width: number, height: number, opts: {
    numPlanks: number
    grainFrequency: number
    grainStrength: number
    baseColors: string[]
    edgeColor: string
}): void {
    const { numPlanks, grainFrequency, grainStrength, baseColors, edgeColor } = opts
    const plankHeight = height / numPlanks
    const edgeRgb = hexToRgb(edgeColor)

    for (let y = 0; y < height; y++) {
        const plankIndex = Math.floor(y / plankHeight)
        const plankLocalY = (y % plankHeight) / plankHeight  // 0..1 within plank

        // Per-plank variation seeded by index
        const plankVariation = noise2D(plankIndex * 7.3, 0.5) * 0.15

        // Plank edge darkening — narrow shadow at top and bottom of each plank
        const edgeT = Math.min(plankLocalY, 1 - plankLocalY)
        const edgeFactor = Math.min(1, edgeT / 0.06)  // 6% of plank height for edge

        const colorIdx = plankIndex % baseColors.length
        const rgb1 = hexToRgb(baseColors[colorIdx])
        const rgb2 = hexToRgb(baseColors[(colorIdx + 1) % baseColors.length])

        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4

            // Fine grain running along Y (within plank)
            const grainVal = (Math.sin(y * grainFrequency) * 0.5 + 0.5)
            const grainNoise = octaveNoise(x * 0.02, y * 0.04, 3, 0.5, 1) * grainStrength
            // Larger-scale variation across plank width (makes boards look different side-to-side)
            const widthVar = octaveNoise(x * 0.006, plankIndex * 3.7, 2, 0.6, 1) * 0.2

            const v = Math.max(0, Math.min(1, grainVal * 0.3 + grainNoise + widthVar + plankVariation + 0.35))

            // Blend between this plank's colors based on large-scale variation
            const blendT = Math.max(0, Math.min(1, plankVariation * 2 + 0.5))
            let r = rgb1.r + (rgb2.r - rgb1.r) * blendT
            let g = rgb1.g + (rgb2.g - rgb1.g) * blendT
            let b = rgb1.b + (rgb2.b - rgb1.b) * blendT

            // Apply grain darkening/lightening
            r = Math.max(0, Math.min(255, r * (0.8 + v * 0.4)))
            g = Math.max(0, Math.min(255, g * (0.8 + v * 0.4)))
            b = Math.max(0, Math.min(255, b * (0.8 + v * 0.4)))

            // Edge shadow (plank gap)
            r = r * edgeFactor + edgeRgb.r * (1 - edgeFactor)
            g = g * edgeFactor + edgeRgb.g * (1 - edgeFactor)
            b = b * edgeFactor + edgeRgb.b * (1 - edgeFactor)

            data[i] = Math.round(r); data[i + 1] = Math.round(g)
            data[i + 2] = Math.round(b); data[i + 3] = 255
        }
    }
}
