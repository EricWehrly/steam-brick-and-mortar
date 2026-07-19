import { describe, it, expect } from 'vitest'
import { paintWallBrick, paintWallBrickNormal } from '../../../../../src/utils/textures/painters/wall-brick'
import { hexToRgb } from '../../../../../src/utils/textures/noise-utils'

describe('wall-brick', () => {
    const width = 256
    const height = 256

    describe('paintWallBrick', () => {
        it('fills all pixels with non-zero alpha', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height)

            for (let i = 0; i < data.length; i += 4) {
                expect(data[i + 3]).toBe(255)
            }
        })

        it('brick and mortar colors are independently adjustable', () => {
            const brick = hexToRgb('#2A6E3F')   // deliberately unusual (green) so it's unmistakable
            const mortar = hexToRgb('#F5F0E8')  // deliberately unusual (near-white)
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height, { brickColor: '#2A6E3F', mortarColor: '#F5F0E8', colorVariation: 0 })

            // Sample the center of the first brick (known to be a face pixel at col=0,row=0)
            // and a pixel on the outer edge (known to fall in the mortar border).
            const pitchX = width / 8
            const pitchY = height / 16
            const faceIdx = (Math.floor(pitchY / 2) * width + Math.floor(pitchX / 2)) * 4
            const mortarIdx = (Math.floor(pitchY / 2) * width + 0) * 4

            expect(Math.abs(data[faceIdx] - brick.r)).toBeLessThan(20)
            expect(Math.abs(data[faceIdx + 1] - brick.g)).toBeLessThan(20)
            expect(Math.abs(data[mortarIdx] - mortar.r)).toBeLessThan(20)
            expect(Math.abs(data[mortarIdx + 1] - mortar.g)).toBeLessThan(20)
        })

        it('has per-brick color variation (not a uniformly-colored stamp)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height, { colorVariation: 0.3 })

            const pitchX = width / 8
            const pitchY = height / 16
            const brick0 = data[(Math.floor(pitchY / 2) * width + Math.floor(pitchX / 2)) * 4]
            const brick1 = data[(Math.floor(pitchY / 2) * width + Math.floor(pitchX * 1.5)) * 4]
            const brick2 = data[(Math.floor(pitchY * 2.5) * width + Math.floor(pitchX / 2)) * 4]
            const allSame = brick0 === brick1 && brick1 === brick2
            expect(allSame).toBe(false)
        })

        it('tiles seamlessly (integer brick grid)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height)

            for (let y = 0; y < height; y++) {
                const iLeft = (y * width + 0) * 4
                const iRight = (y * width + (width - 1)) * 4
                expect(Math.abs(data[iLeft] - data[iRight])).toBeLessThan(40)
            }
        })

        it('does not show a slow gradient across a single brick face (regression: fine-noise frequency was too low relative to brick size, read as "half one color, half the other")', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height, { colorVariation: 0, pockmarkDensity: 0 })

            const pitchX = width / 8
            const pitchY = height / 16
            const rowY = Math.floor(pitchY / 2)
            // Sample across the interior of the first brick's face (avoiding the mortar band
            // at each end). With per-brick tint and pockmarks disabled, the only remaining
            // variation is fine surface noise, which should be small pixel-to-pixel -- not a
            // slow left-to-right sweep across the whole face.
            const leftIdx = (rowY * width + Math.floor(pitchX * 0.15)) * 4
            const rightIdx = (rowY * width + Math.floor(pitchX * 0.85)) * 4
            expect(Math.abs(data[leftIdx] - data[rightIdx])).toBeLessThan(20)
        })

        it('has sparse pockmarks on brick faces', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrick(data, width, height, { colorVariation: 0, pockmarkDensity: 0.9 })

            const brickBase = hexToRgb('#963C2E')
            const pitchX = width / 8
            const pitchY = height / 16
            let darkestDeviation = 0
            for (let dx = 2; dx < pitchX - 2; dx++) {
                const idx = (Math.floor(pitchY / 2) * width + dx) * 4
                darkestDeviation = Math.max(darkestDeviation, brickBase.r - data[idx])
            }
            // A pockmark reads noticeably darker than fine surface noise alone; with density
            // this high the first brick's face should contain at least one.
            expect(darkestDeviation).toBeGreaterThan(15)
        })
    })

    describe('paintWallBrickNormal', () => {
        it('has centered R/G channels and full B channel', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrickNormal(data, width, height)

            let sumR = 0, sumG = 0
            const pixelCount = width * height
            for (let i = 0; i < data.length; i += 4) {
                sumR += data[i]
                sumG += data[i + 1]
                expect(data[i + 2]).toBe(255)
            }
            expect(sumR / pixelCount).toBeGreaterThan(110)
            expect(sumR / pixelCount).toBeLessThan(146)
            expect(sumG / pixelCount).toBeGreaterThan(110)
            expect(sumG / pixelCount).toBeLessThan(146)
        })

        it('shows a real recess at mortar joints (not just a color change)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrickNormal(data, width, height)

            // Sample at the mortar/brick TRANSITION (the slope), not deep mortar center --
            // like the wood groove, height is locally flat deep inside a region and steepest
            // right at the edge. Average over several EVEN-numbered courses only (running
            // bond offsets odd courses by half a brick, which moves where x=2/x=16 actually
            // fall relative to a joint -- restricting to even rows keeps the sample geometry
            // simple) so a single sample point can't land on a pockmark (faces now have
            // sparse random divots too, which legitimately create their own high-deviation
            // spots -- a single fixed face pixel is a fragile sample now that faces aren't
            // uniformly flat by design).
            const pitchY = height / 16
            let edgeTotal = 0, faceTotal = 0
            const evenRows = [0, 2, 4, 6, 8, 10, 12, 14]
            for (const row of evenRows) {
                const rowY = row * pitchY + Math.floor(pitchY / 2)
                const edgeIdx = (rowY * width + 2) * 4
                const faceIdx = (rowY * width + 16) * 4
                edgeTotal += Math.abs(data[edgeIdx] - 128)
                faceTotal += Math.abs(data[faceIdx] - 128)
            }
            const edgeDeviation = edgeTotal / evenRows.length
            const faceDeviation = faceTotal / evenRows.length
            expect(edgeDeviation).toBeGreaterThan(faceDeviation)
            expect(edgeDeviation).toBeGreaterThan(50)
        })

        it('mortar has its own bump texture, not a flat plane (regression: `face` previously zeroed out all mortar-region height contribution)', () => {
            const data = new Uint8ClampedArray(width * height * 4)
            paintWallBrickNormal(data, width, height)

            // y=0 is a horizontal mortar joint between courses, for every column regardless
            // of running-bond row offset. If mortar were perfectly flat, every sample along
            // it would read exactly 128 (no derivative at all).
            const values: number[] = []
            for (let x = 20; x < 200; x += 20) {
                values.push(data[(0 * width + x) * 4])
            }
            expect(values.every(v => v === 128)).toBe(false)
        })
    })
})
