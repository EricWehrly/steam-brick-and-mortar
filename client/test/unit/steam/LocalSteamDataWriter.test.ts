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
import { EventManager } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'

describe('LocalSteamDataWriter', () => {
    beforeEach(() => {
        setupIndexedDBMock()
        AppDetailsCache.resetForTesting()
        invokeMock.mockReset()
        isTauriMock.mockReset()
        resolveGenresMock.mockReset().mockResolvedValue([])
        resolveCategoriesMock.mockReset().mockResolvedValue([])
        EventManager.getInstance().removeAllListeners()
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
            expect(entry?.is_free).toBeUndefined()
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

        it('always writes NO_LOCAL_ARTWORK - preserving real artwork is AppDetailsCache.mergeMany\'s job, not this method\'s', async () => {
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [],
            })

            expect(entry?.artwork).toEqual({
                header: null,
                capsule: null,
                capsule_v5: null,
                background: null,
                background_raw: null,
            })
        })

        it('attaches collection names when provided, omits user_collections otherwise', async () => {
            const withCollections = await LocalSteamDataWriter.buildAppDetailsEntry(
                { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                [{ id: 'ze-done', name: 'Ze Done' }, { id: 'meh', name: 'Meh' }]
            )
            expect(withCollections?.user_collections).toEqual([{ id: 'ze-done', name: 'Ze Done' }, { id: 'meh', name: 'Meh' }])

            const withoutCollections = await LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [],
            })
            expect(withoutCollections?.user_collections).toBeUndefined()
        })
    })

    describe('writeLocalAppMetadata', () => {
        it('no-ops on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(entries.size).toBe(0)
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('no-ops when the local playtime scan finds no appids', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(entries.size).toBe(0)
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
                if (command === 'read_steam_collections') {
                    return Promise.resolve([])
                }
                throw new Error(`unexpected command ${command}`)
            })

            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()
            expect(entries.size).toBe(1)
            expect(entries.get(620)?.name).toBe('Portal 2')

            const cached = await AppDetailsCache.get(620)
            expect(cached?.name).toBe('Portal 2')
            expect(await AppDetailsCache.get(999)).toBeNull()
        })

        it('does not wipe an appid\'s existing artwork on a repeat local-scan write (second-launch regression)', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_local_app_metadata') {
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: ['Puzzle'], genre_ids: [], category_ids: [] },
                    ])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([])
                }
                throw new Error(`unexpected command ${command}`)
            })

            // Simulates a baked-seed or prior network fetch that already gave this appid real
            // artwork, before local-scan ever touches it (e.g. a fresh install's first launch,
            // where BakedCacheLoader.seedIfNeeded() races LocalSteamDataWriter and wins).
            const realArtwork = {
                header: 'https://cdn.example.com/620/header.jpg',
                capsule: 'https://cdn.example.com/620/capsule.jpg',
                capsule_v5: null,
                background: null,
                background_raw: null,
            }
            await AppDetailsCache.set(620, {
                type: 'game',
                name: 'Portal 2',
                artwork: realArtwork,
            })

            // A second local-scan write (e.g. relaunching the desktop app) must not regress the
            // artwork this appid already had - AppDetailsCache.mergeMany keeps existing.artwork
            // since incoming's is NO_LOCAL_ARTWORK (all null, not meaningful), while local-scan's
            // own fields (steamspy_tags here) still update normally.
            await LocalSteamDataWriter.writeLocalAppMetadata()

            const cached = await AppDetailsCache.get(620)
            expect(cached?.artwork).toEqual(realArtwork)
            expect(cached?.steamspy_tags).toEqual({ Puzzle: 1 })
        })

        it('attempts local resolution for a collection-only appid with no playtime entry', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([{ id: 'from-tag-Ze Done', name: 'Ze Done', appids: [620, 400] }])
                }
                if (command === 'read_local_app_metadata') {
                    expect(args?.appids).toEqual(expect.arrayContaining([620, 400]))
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                        { appid: 400, name: 'Portal', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                    ])
                }
                throw new Error(`unexpected command ${command}`)
            })

            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()

            expect(entries.get(400)).toMatchObject({ name: 'Portal', user_collections: [{ id: 'from-tag-Ze Done', name: 'Ze Done' }] })
        })

        it('joins collection membership onto matching appids, including appids in multiple collections', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([
                        { appid: 620, last_played: 1000, playtime_minutes: 60 },
                        { appid: 240, last_played: 500, playtime_minutes: 30 },
                    ])
                }
                if (command === 'read_local_app_metadata') {
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                        { appid: 240, name: 'Counter-Strike: Source', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                    ])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([
                        { id: 'from-tag-Ze Done', name: 'Ze Done', appids: [620, 240] },
                        { id: 'from-tag-Meh', name: 'Meh', appids: [620] },
                    ])
                }
                throw new Error(`unexpected command ${command}`)
            })

            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()

            expect(entries.get(620)?.user_collections).toEqual([
                { id: 'from-tag-Ze Done', name: 'Ze Done' },
                { id: 'from-tag-Meh', name: 'Meh' },
            ])
            expect(entries.get(240)?.user_collections).toEqual([{ id: 'from-tag-Ze Done', name: 'Ze Done' }])
        })

        it('proceeds without collections when read_steam_collections fails', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_local_app_metadata') {
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                    ])
                }
                if (command === 'read_steam_collections') {
                    return Promise.reject(new Error('no collections file'))
                }
                throw new Error(`unexpected command ${command}`)
            })

            const entries = await LocalSteamDataWriter.writeLocalAppMetadata()

            expect(entries.get(620)?.name).toBe('Portal 2')
            expect(entries.get(620)?.user_collections).toBeUndefined()
        })

        it('emits TaxonomyDataReady with source local-scan after a successful write', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_local_app_metadata') {
                    return Promise.resolve([
                        { appid: 620, name: 'Portal 2', developers: [], publishers: [], tags: [], genre_ids: [], category_ids: [] },
                    ])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([])
                }
                throw new Error(`unexpected command ${command}`)
            })
            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.TaxonomyDataReady, handler)

            await LocalSteamDataWriter.writeLocalAppMetadata()

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<{ origin: string }>
            expect(event.detail.origin).toBe('local-scan')
        })

        it('does not emit TaxonomyDataReady when nothing was written', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.TaxonomyDataReady, handler)

            await LocalSteamDataWriter.writeLocalAppMetadata()

            expect(handler).not.toHaveBeenCalled()
        })
    })
})
