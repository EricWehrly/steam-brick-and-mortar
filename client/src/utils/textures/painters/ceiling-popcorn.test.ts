import { describe, it, expect } from 'vitest'
import { paintCeilingPopcorn, paintCeilingPopcornNormal } from './ceiling-popcorn'

describe('ceiling-popcorn', () => {
    const width = 128
    const height = 128

    describe('paintCeilingPopcorn', () => {
        it('fills all pixels with non-zero alpha', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintCeilingPopcorn(data, width, height)
            
            for (let i = 0; i < data.length; i += 4) {
                expect(data[i + 3]).toBe(255)
            }
        })

        it('has meaningful brightness variation', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintCeilingPopcorn(data, width, height)
            
            let minVal = 255
            let maxVal = 0
            
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3
                minVal = Math.min(minVal, avg)
                maxVal = Math.max(maxVal, avg)
            }
            
            expect(maxVal - minVal).toBeGreaterThan(10)
        })

        it('tiles seamlessly', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintCeilingPopcorn(data, width, height)
            
            for (let y = 0; y < height; y++) {
                const iLeft = (y * width + 0) * 4
                const iRight = (y * width + (width - 1)) * 4
                
                // Diff should be small for seamless tiling (allowing some slope/noise jitter but close)
                // Using 35 to be safe across various channels with layered noise
                expect(Math.abs(data[iLeft] - data[iRight])).toBeLessThan(35)
                expect(Math.abs(data[iLeft + 1] - data[iRight + 1])).toBeLessThan(35)
                expect(Math.abs(data[iLeft + 2] - data[iRight + 2])).toBeLessThan(35)
            }
        })
    })

    describe('paintCeilingPopcornNormal', () => {
        it('has centered R/G channels and full B channel', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintCeilingPopcornNormal(data, width, height)
            
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
            
            // Should be roughly 128
            expect(avgR).toBeGreaterThan(120)
            expect(avgR).toBeLessThan(136)
            expect(avgG).toBeGreaterThan(120)
            expect(avgG).toBeLessThan(136)
        })
    })
})
