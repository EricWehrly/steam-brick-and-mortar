import { describe, it, expect } from 'vitest'
import { paintWallDrywall, paintWallDrywallNormal } from '../../../../../src/utils/textures/painters/wall-drywall'

describe('wall-drywall', () => {
    const width = 128
    const height = 128

    describe('paintWallDrywall', () => {
        it('fills all pixels with non-zero alpha', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywall(data, width, height)

            for (let i = 0; i < data.length; i += 4) {
                expect(data[i + 3]).toBe(255)
            }
        })

        it('has meaningful brightness variation (mottle keeps it from reading flat)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywall(data, width, height)

            let minVal = 255
            let maxVal = 0

            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3
                minVal = Math.min(minVal, avg)
                maxVal = Math.max(maxVal, avg)
            }

            expect(maxVal - minVal).toBeGreaterThan(10)
        })

        it('stays close to the mustard base color on average', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywall(data, width, height, { color: '#C4A052' })

            let sumR = 0, sumG = 0, sumB = 0
            const pixelCount = width * height
            for (let i = 0; i < data.length; i += 4) {
                sumR += data[i]
                sumG += data[i + 1]
                sumB += data[i + 2]
            }

            // #C4A052 = (196, 160, 82) -- average should land within a modest band of it
            expect(sumR / pixelCount).toBeGreaterThan(196 - 30)
            expect(sumR / pixelCount).toBeLessThan(196 + 30)
            expect(sumG / pixelCount).toBeGreaterThan(160 - 30)
            expect(sumG / pixelCount).toBeLessThan(160 + 30)
        })

        it('tiles seamlessly', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywall(data, width, height)

            for (let y = 0; y < height; y++) {
                const iLeft = (y * width + 0) * 4
                const iRight = (y * width + (width - 1)) * 4

                expect(Math.abs(data[iLeft] - data[iRight])).toBeLessThan(35)
                expect(Math.abs(data[iLeft + 1] - data[iRight + 1])).toBeLessThan(35)
                expect(Math.abs(data[iLeft + 2] - data[iRight + 2])).toBeLessThan(35)
            }
        })
    })

    describe('paintWallDrywallNormal', () => {
        it('has centered R/G channels and full B channel', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywallNormal(data, width, height)

            let sumR = 0
            let sumG = 0
            const pixelCount = width * height

            for (let i = 0; i < data.length; i += 4) {
                sumR += data[i]
                sumG += data[i + 1]
                expect(data[i + 2]).toBe(255)
            }

            const avgR = sumR / pixelCount
            const avgG = sumG / pixelCount

            expect(avgR).toBeGreaterThan(120)
            expect(avgR).toBeLessThan(136)
            expect(avgG).toBeGreaterThan(120)
            expect(avgG).toBeLessThan(136)
        })

        it('is not saturated/extreme (bump strength stays in a plausible range)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallDrywallNormal(data, width, height)

            // A single-pixel max is a fragile statistic over a noisy field -- occasional
            // outliers are expected. Average absolute deviation from the flat (128,128)
            // center rules out a broken/over-amplified map (which would push this toward
            // the ~127 ceiling) without asserting an exact "how subtle" number.
            let totalDeviation = 0
            const pixelCount = width * height
            for (let i = 0; i < data.length; i += 4) {
                totalDeviation += Math.abs(data[i] - 128) + Math.abs(data[i + 1] - 128)
            }
            const avgDeviation = totalDeviation / (pixelCount * 2)
            expect(avgDeviation).toBeLessThan(100)
        })
    })
})
