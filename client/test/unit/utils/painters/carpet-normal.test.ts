/**
 * carpet-normal painter unit tests
 *
 * Tests the math contract of the normal map generator, not pixel values.
 * All computation is pure typed-array arithmetic — no DOM, no Three.js, no OffscreenCanvas.
 *
 * Contract assertions:
 *  - Alpha channel is always 255 (opaque)
 *  - A flat surface (zero intensity) encodes a straight-up normal (128, 128, 255)
 *  - The blue channel (Z component) is always >= red and green (surface mostly faces up)
 *  - Varying intensity produces different output (the parameter is actually used)
 */

import { describe, it, expect } from 'vitest'
import { paintCarpetNormal } from '../../../../src/utils/textures/painters/carpet-normal'

describe('paintCarpetNormal', () => {
    it('fills every alpha channel to 255 (fully opaque)', () => {
        const w = 32, h = 32
        const data = new Uint8ClampedArray(w * h * 4)
        paintCarpetNormal(data, w, h)

        for (let i = 3; i < data.length; i += 4) {
            expect(data[i]).toBe(255)
        }
    })

    it('blue channel (Z) dominates — surface mostly faces up', () => {
        const w = 32, h = 32
        const data = new Uint8ClampedArray(w * h * 4)
        paintCarpetNormal(data, w, h, { intensity: 0.3 })

        let totalR = 0, totalG = 0, totalB = 0
        const pixels = w * h
        for (let i = 0; i < data.length; i += 4) {
            totalR += data[i]; totalG += data[i + 1]; totalB += data[i + 2]
        }
        // Z (blue) should average higher than X and Y since nz=1 dominates the normal
        expect(totalB / pixels).toBeGreaterThan(totalR / pixels)
        expect(totalB / pixels).toBeGreaterThan(totalG / pixels)
        // Blue should be clearly in the upper half of the range (>180 avg)
        expect(totalB / pixels).toBeGreaterThan(180)
    })

    it('at zero intensity the output approaches the neutral normal (128, 128, 255)', () => {
        // With intensity=0 gradients vanish: nx=0, ny=0, nz=1 → (128, 128, 255)
        const w = 16, h = 16
        const data = new Uint8ClampedArray(w * h * 4)
        paintCarpetNormal(data, w, h, { intensity: 0, pileHeight: 0, fiberVariation: 0 })

        for (let i = 0; i < data.length; i += 4) {
            // R and G should be near 128 (neutral X/Y)
            expect(data[i]).toBeCloseTo(128, -1)      // R: within ~5
            expect(data[i + 1]).toBeCloseTo(128, -1)  // G: within ~5
            // B should be near 255 (normal points straight up)
            expect(data[i + 2]).toBeGreaterThan(250)
        }
    })

    it('higher intensity produces stronger gradients (more deviation from 128 in XY channels)', () => {
        const w = 32, h = 32
        const low  = new Uint8ClampedArray(w * h * 4)
        const high = new Uint8ClampedArray(w * h * 4)
        paintCarpetNormal(low,  w, h, { intensity: 0.1, pileHeight: 0.3, fiberVariation: 0.3 })
        paintCarpetNormal(high, w, h, { intensity: 1.0, pileHeight: 0.3, fiberVariation: 0.3 })

        // Measure average deviation of R channel from 128 as a proxy for gradient strength
        let devLow = 0, devHigh = 0
        const pixels = w * h
        for (let i = 0; i < low.length; i += 4) {
            devLow  += Math.abs(low[i]  - 128)
            devHigh += Math.abs(high[i] - 128)
        }
        expect(devHigh / pixels).toBeGreaterThan(devLow / pixels)
    })

    it('produces deterministic output (no random, same input = same output)', () => {
        const w = 32, h = 32
        const a = new Uint8ClampedArray(w * h * 4)
        const b = new Uint8ClampedArray(w * h * 4)
        paintCarpetNormal(a, w, h, { intensity: 0.3, pileHeight: 0.3, fiberVariation: 0.2 })
        paintCarpetNormal(b, w, h, { intensity: 0.3, pileHeight: 0.3, fiberVariation: 0.2 })
        expect(a).toEqual(b)
    })
})
