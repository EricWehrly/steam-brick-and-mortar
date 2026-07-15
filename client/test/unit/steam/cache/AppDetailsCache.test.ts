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
        AppDetailsCache.resetForTesting()
    })

    it('returns only appids with no cache entry at all', async () => {
        await AppDetailsCache.set(620, makeEntry('Portal 2'))

        const missing = await AppDetailsCache.findMissing([620, 400, 240])

        expect(missing).toEqual([400, 240])
    })

    it('returns an empty array when every appid is already cached', async () => {
        await AppDetailsCache.set(620, makeEntry('Portal 2'))
        await AppDetailsCache.set(400, makeEntry('Portal'))

        expect(await AppDetailsCache.findMissing([620, 400])).toEqual([])
    })

    it('returns every appid unchanged when the cache is empty', async () => {
        expect(await AppDetailsCache.findMissing([620, 400])).toEqual([620, 400])
    })
})

describe('AppDetailsCache.mergeMany', () => {
    beforeEach(() => {
        setupIndexedDBMock()
        AppDetailsCache.resetForTesting()
    })

    it('writes incoming as-is when there is no existing entry', async () => {
        const incoming: AppDetailsData = { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, userscore: 90 }

        await AppDetailsCache.mergeMany(new Map([[620, incoming]]), 1000)

        expect(await AppDetailsCache.get(620)).toMatchObject({ name: 'Portal 2', userscore: 90 })
    })

    it('existing wins when incoming is empty for that field, regardless of timestamp', async () => {
        await AppDetailsCache.set(620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, developers: ['Valve'] })

        // A much later timestamp doesn't help - incoming just has nothing for `developers`.
        const incoming: AppDetailsData = { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK }
        await AppDetailsCache.mergeMany(new Map([[620, incoming]]), Date.now() + 1_000_000)

        expect((await AppDetailsCache.get(620))?.developers).toEqual(['Valve'])
    })

    it('incoming wins when it is meaningful and at least as new as the existing record', async () => {
        await AppDetailsCache.set(620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, developers: ['Old Dev'] })

        const incoming: AppDetailsData = { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, developers: ['Valve'] }
        await AppDetailsCache.mergeMany(new Map([[620, incoming]]), Date.now() + 1000)

        expect((await AppDetailsCache.get(620))?.developers).toEqual(['Valve'])
    })

    it('existing wins when incoming is meaningful but strictly older than the existing record', async () => {
        const now = Date.now()
        await AppDetailsCache.mergeMany(
            new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, developers: ['Newer Dev'] }]]),
            now
        )

        const staleIncoming: AppDetailsData = { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, developers: ['Stale Dev'] }
        await AppDetailsCache.mergeMany(new Map([[620, staleIncoming]]), now - 5000)

        expect((await AppDetailsCache.get(620))?.developers).toEqual(['Newer Dev'])
    })

    it('a known is_free is not erased by a later write that omits it entirely', async () => {
        const now = Date.now()
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, is_free: true }]]), now)

        // A later write that doesn't know is_free at all (omitted, not `false`) must not erase the known answer.
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK }]]), now + 1000)

        expect((await AppDetailsCache.get(620))?.is_free).toBe(true)
    })

    it('merges artwork per sub-field instead of replacing the whole object', async () => {
        await AppDetailsCache.set(620, {
            type: 'game', name: 'Portal 2',
            artwork: { header: 'https://cdn/header.jpg', capsule: null, capsule_v5: null, background: null, background_raw: null },
        })

        const incoming: AppDetailsData = {
            type: 'game', name: 'Portal 2',
            artwork: { header: null, capsule: 'https://cdn/capsule.jpg', capsule_v5: null, background: null, background_raw: null },
        }
        await AppDetailsCache.mergeMany(new Map([[620, incoming]]), Date.now() + 1000)

        expect((await AppDetailsCache.get(620))?.artwork).toEqual({
            header: 'https://cdn/header.jpg', // kept - incoming had nothing for this sub-field
            capsule: 'https://cdn/capsule.jpg', // taken - incoming had a real value here
            capsule_v5: null, background: null, background_raw: null,
        })
    })

    it('a real userscore of 0 is treated as meaningful data, not "unset"', async () => {
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK, userscore: 0 }]]), 1000)

        // A later, newer write with no userscore at all must not erase the real (if zero) value.
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK }]]), 2000)

        expect((await AppDetailsCache.get(620))?.userscore).toBe(0)
    })

    it('both sides empty for a field resolves to the canonical empty value, not leftover garbage', async () => {
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK }]]), 1000)
        await AppDetailsCache.mergeMany(new Map([[620, { type: 'game', name: 'Portal 2', artwork: NO_ARTWORK }]]), 2000)

        const result = await AppDetailsCache.get(620)
        expect(result?.developers).toBeUndefined()
        expect(result?.artwork).toEqual(NO_ARTWORK)
    })
})
