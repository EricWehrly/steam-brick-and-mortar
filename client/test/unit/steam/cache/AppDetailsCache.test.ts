import { describe, it, expect, beforeEach } from 'vitest'
import { setupIndexedDBMock } from '../../../mocks/indexeddb.mock'
import { AppDetailsCache } from '../../../../src/steam/cache/AppDetailsCache'
import type { AppDetailsData } from '../../../../src/steam/batch/BatchAppDetailsClient'

const NO_ARTWORK: AppDetailsData['artwork'] = {
    header: null, capsule: null, capsule_v5: null, background: null, background_raw: null,
}

function makeEntry(name: string): AppDetailsData {
    return { type: 'game', name, is_free: false, artwork: NO_ARTWORK }
}

describe('AppDetailsCache.findMissing', () => {
    beforeEach(() => {
        setupIndexedDBMock()
    })

    it('returns only appids with no cache entry at all', async () => {
        const cache = new AppDetailsCache()
        await cache.set(620, makeEntry('Portal 2'))

        const missing = await cache.findMissing([620, 400, 240])

        expect(missing).toEqual([400, 240])
    })

    it('returns an empty array when every appid is already cached', async () => {
        const cache = new AppDetailsCache()
        await cache.set(620, makeEntry('Portal 2'))
        await cache.set(400, makeEntry('Portal'))

        expect(await cache.findMissing([620, 400])).toEqual([])
    })

    it('returns every appid unchanged when the cache is empty', async () => {
        const cache = new AppDetailsCache()
        expect(await cache.findMissing([620, 400])).toEqual([620, 400])
    })
})
