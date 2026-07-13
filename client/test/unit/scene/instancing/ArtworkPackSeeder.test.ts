/**
 * Unit Tests for ArtworkPackSeeder
 *
 * Tests:
 * - Skips gracefully when no pack is shipped (index fetch 404/error)
 * - Skips re-seeding when the pack is already in PixelDataCache
 * - Seeds PixelDataCache under the real Steam CDN URL, both MID and HIGH sizes
 * - Never throws on failure (fetch error, decode error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArtworkPackSeeder } from '../../../../src/scene/game-box/instancing/ArtworkPackSeeder'

const { decodeArtworkPackMock, pixelCacheGetMock, pixelCachePutMock } = vi.hoisted(() => ({
    decodeArtworkPackMock: vi.fn(),
    pixelCacheGetMock: vi.fn(),
    pixelCachePutMock: vi.fn()
}))

vi.mock('../../../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: vi.fn().mockImplementation(function () {
        return {
            decodeArtworkPack: decodeArtworkPackMock,
            dispose: vi.fn()
        }
    })
}))

vi.mock('../../../../src/scene/game-box/instancing/PixelDataCache', () => ({
    PixelDataCache: {
        getInstance: vi.fn().mockReturnValue({
            get: pixelCacheGetMock,
            put: pixelCachePutMock
        })
    }
}))

const SAMPLE_INDEX = {
    generated_at: '2026-07-12T00:00:00Z',
    tileWidth: 300,
    tileHeight: 450,
    entries: {
        '440': { x: 0, y: 0 },
        '570': { x: 300, y: 0 }
    }
}

function mockFetchResponses(index: unknown = SAMPLE_INDEX, packOk = true): void {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url.includes('pack-index.json')) {
            return Promise.resolve({
                ok: index !== null,
                status: index !== null ? 200 : 404,
                json: () => Promise.resolve(index)
            })
        }
        if (url.includes('pack.jpg')) {
            return Promise.resolve({
                ok: packOk,
                status: packOk ? 200 : 404,
                blob: () => Promise.resolve(new Blob(['fake-jpeg-bytes']))
            })
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }))
}

describe('ArtworkPackSeeder', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        pixelCacheGetMock.mockResolvedValue(null)
        decodeArtworkPackMock.mockResolvedValue([
            { appid: 440, midPixels: new Uint8ClampedArray(150 * 225 * 4), highPixels: new Uint8ClampedArray(300 * 450 * 4) },
            { appid: 570, midPixels: new Uint8ClampedArray(150 * 225 * 4), highPixels: new Uint8ClampedArray(300 * 450 * 4) }
        ])
    })

    it('skips gracefully when no pack index is shipped (404)', async () => {
        mockFetchResponses(null)

        await new ArtworkPackSeeder().seedIfNeeded()

        expect(decodeArtworkPackMock).not.toHaveBeenCalled()
        expect(pixelCachePutMock).not.toHaveBeenCalled()
    })

    it('skips re-seeding when the pack is already in PixelDataCache', async () => {
        mockFetchResponses()
        pixelCacheGetMock.mockResolvedValueOnce({ pixelData: new Uint8ClampedArray(1), width: 150, height: 225 })

        await new ArtworkPackSeeder().seedIfNeeded()

        expect(decodeArtworkPackMock).not.toHaveBeenCalled()
        expect(pixelCachePutMock).not.toHaveBeenCalled()
    })

    it('seeds PixelDataCache under the real Steam CDN URL at both MID and HIGH sizes', async () => {
        mockFetchResponses()

        await new ArtworkPackSeeder().seedIfNeeded()

        expect(decodeArtworkPackMock).toHaveBeenCalledWith(
            expect.any(Blob),
            [{ appid: 440, x: 0, y: 0 }, { appid: 570, x: 300, y: 0 }],
            300, 450, // tile size
            150, 225, // MID
            300, 450  // HIGH
        )

        expect(pixelCachePutMock).toHaveBeenCalledWith(
            'https://cdn.akamai.steamstatic.com/steam/apps/440/library_600x900.jpg',
            expect.any(Uint8ClampedArray), 150, 225
        )
        expect(pixelCachePutMock).toHaveBeenCalledWith(
            'https://cdn.akamai.steamstatic.com/steam/apps/440/library_600x900.jpg',
            expect.any(Uint8ClampedArray), 300, 450
        )
        expect(pixelCachePutMock).toHaveBeenCalledTimes(4) // 2 games x (MID + HIGH)
    })

    it('never throws when the pack image fetch fails', async () => {
        mockFetchResponses(SAMPLE_INDEX, false)

        await expect(new ArtworkPackSeeder().seedIfNeeded()).resolves.toBeUndefined()
        expect(decodeArtworkPackMock).not.toHaveBeenCalled()
    })

    it('never throws when fetch rejects entirely', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

        await expect(new ArtworkPackSeeder().seedIfNeeded()).resolves.toBeUndefined()
        expect(decodeArtworkPackMock).not.toHaveBeenCalled()
    })
})
