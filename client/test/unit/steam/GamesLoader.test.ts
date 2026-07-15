import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GamesLoader } from '../../../src/steam/GamesLoader'
import type { AppDetailsData, AppDetailsResponse } from '../../../src/steam/batch/BatchAppDetailsClient'

const NO_ARTWORK: AppDetailsData['artwork'] = {
    header: null, capsule: null, capsule_v5: null, background: null, background_raw: null,
}

describe('GamesLoader.fetchAndCacheAppDetails', () => {
    let setManyMock: ReturnType<typeof vi.fn>
    let fetchBatchMock: ReturnType<typeof vi.fn>
    let loader: GamesLoader

    beforeEach(() => {
        setManyMock = vi.fn().mockResolvedValue(undefined)
        fetchBatchMock = vi.fn()
        loader = new GamesLoader(
            { setMany: setManyMock } as any,
            {} as any,
            { fetchBatch: fetchBatchMock } as any
        )
    })

    it('returns an empty map without calling fetchBatch when given no appids', async () => {
        const result = await loader.fetchAndCacheAppDetails([])
        expect(result.size).toBe(0)
        expect(fetchBatchMock).not.toHaveBeenCalled()
    })

    it('normalizes successful responses and writes them into AppDetailsCache', async () => {
        const responses = new Map<number, AppDetailsResponse>([
            [620, {
                success: true,
                appid: 620,
                retrieved_at: '2026-01-01T00:00:00Z',
                data: { name: 'Portal 2', type: 'game', is_free: false, artwork: NO_ARTWORK },
            }],
        ])
        fetchBatchMock.mockResolvedValue(responses)

        const result = await loader.fetchAndCacheAppDetails([620])

        expect(result.get(620)?.name).toBe('Portal 2')
        expect(setManyMock).toHaveBeenCalledTimes(1)
        expect(setManyMock.mock.calls[0][0].get(620).name).toBe('Portal 2')
    })

    it('omits appids with no data rather than failing the whole call', async () => {
        const responses = new Map<number, AppDetailsResponse>([
            [620, { success: true, appid: 620, retrieved_at: '2026-01-01T00:00:00Z', data: { name: 'Portal 2', type: 'game', is_free: false, artwork: NO_ARTWORK } }],
            [999, { success: false, appid: 999, retrieved_at: '2026-01-01T00:00:00Z' }],
        ])
        fetchBatchMock.mockResolvedValue(responses)

        const result = await loader.fetchAndCacheAppDetails([620, 999])

        expect(result.has(620)).toBe(true)
        expect(result.has(999)).toBe(false)
    })

    it('skips unlisted responses instead of caching a name-less shell', async () => {
        const responses = new Map<number, AppDetailsResponse>([
            [620, { success: true, appid: 620, retrieved_at: '2026-01-01T00:00:00Z', data: { name: 'Portal 2', type: 'game', is_free: false, artwork: NO_ARTWORK } }],
            // Lambda's negative-shell response for a delisted/unlisted appid - no `data`, no `name`.
            [999, { success: false, appid: 999, unlisted: true, retrieved_at: '2026-01-01T00:00:00Z' }],
        ])
        fetchBatchMock.mockResolvedValue(responses)

        const result = await loader.fetchAndCacheAppDetails([620, 999])

        expect(result.has(999)).toBe(false)
        expect(setManyMock.mock.calls[0][0].has(999)).toBe(false)
    })

    it('does not write to AppDetailsCache when nothing resolved', async () => {
        fetchBatchMock.mockResolvedValue(new Map())

        const result = await loader.fetchAndCacheAppDetails([620])

        expect(result.size).toBe(0)
        expect(setManyMock).not.toHaveBeenCalled()
    })
})
