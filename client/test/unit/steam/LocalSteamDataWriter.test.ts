import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupIndexedDBMock } from '../../mocks/indexeddb.mock'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
    isTauriMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
    isTauri: isTauriMock,
}))

const { resolveGenresMock, resolveCategoriesMock } = vi.hoisted(() => ({
    resolveGenresMock: vi.fn(),
    resolveCategoriesMock: vi.fn(),
}))

vi.mock('../../../src/steam/TaxonomyIdResolver', () => ({
    TaxonomyIdResolver: {
        resolveGenres: resolveGenresMock,
        resolveCategories: resolveCategoriesMock,
    },
}))

import { LocalSteamDataWriter } from '../../../src/steam/LocalSteamDataWriter'
import { AppDetailsCache } from '../../../src/steam/cache/AppDetailsCache'

describe('LocalSteamDataWriter', () => {
    beforeEach(() => {
        setupIndexedDBMock()
        invokeMock.mockReset()
        isTauriMock.mockReset()
        resolveGenresMock.mockReset().mockResolvedValue([])
        resolveCategoriesMock.mockReset().mockResolvedValue([])
    })

    describe('buildAppDetailsEntry', () => {
        it('returns null when appinfo.vdf has no name for this appid', async () => {
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: null,
                developers: [],
                publishers: [],
                tags: [],
                genre_ids: [],
                category_ids: [],
            })
            expect(entry).toBeNull()
        })

        it('builds a valid entry with rank-derived descending tag weights', async () => {
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: 'Portal 2',
                developers: ['Valve'],
                publishers: ['Valve'],
                tags: ['Singleplayer', 'Puzzle', 'Co-op'],
                genre_ids: [],
                category_ids: [],
            })

            expect(entry).not.toBeNull()
            expect(entry?.name).toBe('Portal 2')
            expect(entry?.type).toBe('game')
            expect(entry?.is_free).toBe(false)
            expect(entry?.artwork).toEqual({
                header: null,
                capsule: null,
                capsule_v5: null,
                background: null,
                background_raw: null,
            })
            expect(entry?.developers).toEqual(['Valve'])
            expect(entry?.publishers).toEqual(['Valve'])
            expect(entry?.steamspy_tags).toEqual({
                Singleplayer: 3,
                Puzzle: 2,
                'Co-op': 1,
            })
        })

        it('omits developers/publishers/steamspy_tags/genres/categories when empty rather than storing empty arrays', async () => {
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: 'Portal 2',
                developers: [],
                publishers: [],
                tags: [],
                genre_ids: [],
                category_ids: [],
            })
            expect(entry?.developers).toBeUndefined()
            expect(entry?.publishers).toBeUndefined()
            expect(entry?.steamspy_tags).toBeUndefined()
            expect(entry?.genres).toBeUndefined()
            expect(entry?.categories).toBeUndefined()
        })

        it('resolves genre/category ids via TaxonomyIdResolver', async () => {
            resolveGenresMock.mockResolvedValue([{ id: '1', description: 'Action' }])
            resolveCategoriesMock.mockResolvedValue([{ id: 2, description: 'Single-player' }])

            const entry = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: 'Portal 2',
                developers: [],
                publishers: [],
                tags: [],
                genre_ids: [1],
                category_ids: [2],
            })

            expect(resolveGenresMock).toHaveBeenCalledWith([1])
            expect(resolveCategoriesMock).toHaveBeenCalledWith([2])
            expect(entry?.genres).toEqual([{ id: '1', description: 'Action' }])
            expect(entry?.categories).toEqual([{ id: 2, description: 'Single-player' }])
        })
    })

    describe('writeLocalAppMetadata', () => {
        it('no-ops on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            const count = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(count).toBe(0)
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('no-ops when the local playtime scan finds no appids', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            const count = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(count).toBe(0)
        })

        it('writes resolved entries into AppDetailsCache, skipping nameless appids', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([
                        { appid: 620, last_played: 1000, playtime_minutes: 60 },
                        { appid: 999, last_played: null, playtime_minutes: 5 },
                    ])
                }
                if (command === 'read_local_app_metadata') {
                    expect(args?.appids).toEqual([620, 999])
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: ['Valve'], publishers: ['Valve'], tags: ['Puzzle'], genre_ids: [], category_ids: [] },
                        { appid: 999, name: null, developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                    ])
                }
                throw new Error(`unexpected command ${command}`)
            })

            const count = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(count).toBe(1)

            const cache = new AppDetailsCache()
            const cached = await cache.get(620)
            expect(cached?.name).toBe('Portal 2')
            expect(await cache.get(999)).toBeNull()
        })
    })
})
