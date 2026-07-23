import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { buildPosterTexture, POSTER_MAX_DIMENSION } from '../../../../../src/scene/props/wall-art/PosterTexture'

/**
 * jsdom doesn't implement createImageBitmap or real canvas 2D rendering - both are mocked at
 * the browser-API boundary here, per this project's "mock at the boundary" testing convention.
 * What's actually under test is the resize math (does it scale down/never up, preserve aspect)
 * and the texture setup (colorSpace, needsUpdate), not real pixel decoding.
 */
function mockBitmap(width: number, height: number): ImageBitmap {
    return { width, height, close: vi.fn() } as unknown as ImageBitmap
}

describe('buildPosterTexture', () => {
    let drawImageMock: ReturnType<typeof vi.fn>
    let getContextSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        drawImageMock = vi.fn()
        // getContext is overloaded (2d/webgl/webgpu/...) - `any` sidesteps TS picking the
        // wrong overload's return type for this single shared mock across all of them.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
            drawImage: drawImageMock,
        })) as any)
    })

    afterEach(() => {
        getContextSpy.mockRestore()
        vi.unstubAllGlobals()
    })

    it('scales down an image larger than the cap, preserving aspect ratio', async () => {
        const bitmap = mockBitmap(2560, 1600)
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

        const texture = await buildPosterTexture(new Uint8Array([1, 2, 3]), 1024)

        expect(texture.image.width).toBe(1024)
        expect(texture.image.height).toBe(640) // 1600 * (1024/2560)
        expect(drawImageMock).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 640)
        expect(bitmap.close).toHaveBeenCalledTimes(1)
    })

    it('never upscales an image already smaller than the cap', async () => {
        const bitmap = mockBitmap(400, 300)
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

        const texture = await buildPosterTexture(new Uint8Array([1, 2, 3]), 1024)

        expect(texture.image.width).toBe(400)
        expect(texture.image.height).toBe(300)
    })

    it('defaults to POSTER_MAX_DIMENSION when no cap is passed', async () => {
        const bitmap = mockBitmap(2560, 1600)
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

        const texture = await buildPosterTexture(new Uint8Array([1, 2, 3]))

        expect(Math.max(texture.image.width, texture.image.height)).toBe(POSTER_MAX_DIMENSION)
    })

    it('sets sRGB color space and marks the texture for GPU upload', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap(800, 600)))

        const texture = await buildPosterTexture(new Uint8Array([1, 2, 3]))

        expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
        // needsUpdate is a write-only setter on THREE.Texture (bumps .version, no readable
        // flag) - version > 0 is the only observable proof the setter actually ran.
        expect(texture.version).toBeGreaterThan(0)
    })

    it('closes the bitmap even if drawImage throws', async () => {
        const bitmap = mockBitmap(800, 600)
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
        drawImageMock.mockImplementation(() => {
            throw new Error('draw failed')
        })

        await expect(buildPosterTexture(new Uint8Array([1, 2, 3]))).rejects.toThrow('draw failed')
        expect(bitmap.close).toHaveBeenCalledTimes(1)
    })
})
