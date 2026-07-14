import { describe, it, expect, beforeEach, vi } from 'vitest'

const { fetchBundleMock } = vi.hoisted(() => ({
    fetchBundleMock: vi.fn(),
}))

vi.mock('../../../src/steam/cache/BakedCacheLoader', () => ({
    BakedCacheLoader: {
        fetchBundle: fetchBundleMock,
    },
}))

import { TaxonomyIdResolver } from '../../../src/steam/TaxonomyIdResolver'

describe('TaxonomyIdResolver', () => {
    beforeEach(() => {
        fetchBundleMock.mockReset()
        TaxonomyIdResolver.resetCache()
    })

    it('resolves genre/category ids found in the bundle, top-level or under full_data', async () => {
        fetchBundleMock.mockResolvedValue({
            generated_at: '2026-01-01T00:00:00Z',
            games: {
                '220': {
                    success: true,
                    appid: 220,
                    retrieved_at: '2026-01-01T00:00:00Z',
                    data: {
                        name: 'Half-Life 2',
                        type: 'game',
                        is_free: false,
                        artwork: { header: null, capsule: null, capsule_v5: null, background: null, background_raw: null },
                        full_data: {
                            genres: [{ id: '1', description: 'Action' }],
                            categories: [{ id: 2, description: 'Single-player' }],
                        },
                    },
                },
                '400': {
                    success: true,
                    appid: 400,
                    retrieved_at: '2026-01-01T00:00:00Z',
                    data: {
                        name: 'Portal',
                        type: 'game',
                        is_free: false,
                        artwork: { header: null, capsule: null, capsule_v5: null, background: null, background_raw: null },
                        genres: [{ id: '1', description: 'Action' }],
                        categories: [{ id: 22, description: 'Steam Achievements' }],
                    },
                },
            },
        })

        const genres = await TaxonomyIdResolver.resolveGenres([1])
        const categories = await TaxonomyIdResolver.resolveCategories([2, 22])

        expect(genres).toEqual([{ id: '1', description: 'Action' }])
        expect(categories).toEqual([
            { id: 2, description: 'Single-player' },
            { id: 22, description: 'Steam Achievements' },
        ])
        expect(fetchBundleMock).toHaveBeenCalledTimes(1)
    })

    it('skips ids with no entry in the bundle instead of failing', async () => {
        fetchBundleMock.mockResolvedValue({
            generated_at: '2026-01-01T00:00:00Z',
            games: {},
        })

        const genres = await TaxonomyIdResolver.resolveGenres([1, 25])
        const categories = await TaxonomyIdResolver.resolveCategories([2, 9])

        expect(genres).toEqual([])
        expect(categories).toEqual([])
    })

    it('handles a missing/failed bundle fetch the same as an empty one', async () => {
        fetchBundleMock.mockResolvedValue(null)

        const genres = await TaxonomyIdResolver.resolveGenres([1])
        expect(genres).toEqual([])
    })

    it('fetches the bundle only once across multiple resolve calls', async () => {
        fetchBundleMock.mockResolvedValue({ generated_at: '2026-01-01T00:00:00Z', games: {} })

        await TaxonomyIdResolver.resolveGenres([1])
        await TaxonomyIdResolver.resolveCategories([2])
        await TaxonomyIdResolver.resolveGenres([3])

        expect(fetchBundleMock).toHaveBeenCalledTimes(1)
    })
})
