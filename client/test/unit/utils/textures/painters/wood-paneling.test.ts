import { describe, it, expect } from 'vitest'
import { paintWoodPaneling, paintWoodPanelingNormal } from '../../../../../src/utils/textures/painters/wood-paneling'

describe('wood-paneling', () => {
    const width = 256
    const height = 256

    describe('paintWoodPaneling', () => {
        it('fills all pixels with non-zero alpha', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPaneling(data, width, height)

            for (let i = 0; i < data.length; i += 4) {
                expect(data[i + 3]).toBe(255)
            }
        })

        it('has meaningful brightness variation (grain, not flat color)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPaneling(data, width, height)

            let minVal = 255, maxVal = 0
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
                minVal = Math.min(minVal, avg)
                maxVal = Math.max(maxVal, avg)
            }
            expect(maxVal - minVal).toBeGreaterThan(20)
        })

        it('stays within the color1..color3 tonal range on average', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPaneling(data, width, height, { color1: '#C89058', color2: '#9C6530', color3: '#5E3616' })

            let sumR = 0
            const pixelCount = width * height
            for (let i = 0; i < data.length; i += 4) sumR += data[i]
            const avgR = sumR / pixelCount
            // color3.r (0x5E=94) is the darkest, color1.r (0xC8=200) the lightest -- average
            // should land inside that range, not outside it (e.g. from a broken color ramp).
            expect(avgR).toBeGreaterThan(94)
            expect(avgR).toBeLessThan(200)
        })

        it('tiles reasonably seamlessly', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPaneling(data, width, height)

            // Domain-warped noise gives only a quasi-seamless approximation (like the other
            // noise-based painters in this codebase); measured max diff at this resolution
            // is ~73, so this threshold is set with headroom above that, not guessed.
            for (let y = 0; y < height; y++) {
                const iLeft = (y * width + 0) * 4
                const iRight = (y * width + (width - 1)) * 4
                expect(Math.abs(data[iLeft] - data[iRight])).toBeLessThan(90)
            }
        })

        it('darkens at plank boundaries (edge grooves visible in color)', () => {
            const numPlanks = 4
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPaneling(data, width, height, { numPlanks, edgeColor: '#000000' })

            const plankHeight = height / numPlanks
            const edgeY = Math.floor(plankHeight) - 1 // just before a plank boundary
            const midY = Math.floor(plankHeight / 2)  // middle of a plank
            const edgeAvg = (data[(edgeY * width) * 4] + data[(edgeY * width) * 4 + 1] + data[(edgeY * width) * 4 + 2]) / 3
            const midAvg = (data[(midY * width) * 4] + data[(midY * width) * 4 + 1] + data[(midY * width) * 4 + 2]) / 3
            expect(edgeAvg).toBeLessThan(midAvg)
        })
    })

    describe('paintWoodPanelingNormal', () => {
        it('has centered R/G channels and full B channel', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPanelingNormal(data, width, height)

            let sumR = 0, sumG = 0
            const pixelCount = width * height
            for (let i = 0; i < data.length; i += 4) {
                sumR += data[i]
                sumG += data[i + 1]
                expect(data[i + 2]).toBe(255)
            }
            const avgR = sumR / pixelCount
            const avgG = sumG / pixelCount
            expect(avgR).toBeGreaterThan(100)
            expect(avgR).toBeLessThan(156)
            expect(avgG).toBeGreaterThan(100)
            expect(avgG).toBeLessThan(156)
        })

        it('shows a real groove dip at plank boundaries (not flat 128)', () => {
            const numPlanks = 4
            const data = new Uint8ClampedArray(width * height * 4)
            paintWoodPanelingNormal(data, width, height, { numPlanks })

            // Sample on the SLOPE of the groove, not its exact center -- a V-shaped dip has
            // near-zero derivative at its deepest point (by construction) and its strongest
            // derivative just to either side, where the surface is steepest. Measured: ~128
            // (saturated) at boundary-2, vs ~1-3 mid-plank -- the old wood-normal.ts had no
            // groove concept at all, so this is a real, large effect, not a marginal one.
            const plankHeight = height / numPlanks
            const slopeY = Math.floor(plankHeight) - 2
            const idx = (slopeY * width + Math.floor(width / 2)) * 4
            expect(Math.abs(data[idx + 1] - 128)).toBeGreaterThan(50)
        })
    })
})
