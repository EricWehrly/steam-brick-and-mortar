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
            // right at the edge. Measured: x=1..2 (edge) ~127 (saturated) vs x=8+ (brick face
            // interior) ~1-3 -- a large, unambiguous effect, not a marginal one.
            const pitchY = height / 16
            const edgeIdx = (Math.floor(pitchY / 2) * width + 2) * 4
            const faceIdx = (Math.floor(pitchY / 2) * width + 16) * 4
            const edgeDeviation = Math.abs(data[edgeIdx] - 128)
            const faceDeviation = Math.abs(data[faceIdx] - 128)
            expect(edgeDeviation).toBeGreaterThan(faceDeviation)
            expect(edgeDeviation).toBeGreaterThan(50)
        })
    })
})
