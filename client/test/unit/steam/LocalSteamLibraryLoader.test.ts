import { describe, it, expect, beforeEach, vi } from 'vitest'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
    isTauriMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
    isTauri: isTauriMock,
}))

const { writeLocalAppMetadataMock, mergeCollectionsForAppidsMock } = vi.hoisted(() => ({
    writeLocalAppMetadataMock: vi.fn(),
    mergeCollectionsForAppidsMock: vi.fn(),
}))

// readCollectionsByAppid is kept real (not mocked) - it just calls the already-mocked `invoke`,
// and LocalSteamLibraryLoader now depends on its actual Map-building behavior, not just a stub.
vi.mock('../../../src/steam/LocalSteamDataWriter', async (importOriginal) => {
    // Class methods are non-enumerable, so {...actual.LocalSteamDataWriter} silently drops them -
    // reference readCollectionsByAppid explicitly instead of trying to spread the class.
    const actual = await importOriginal<typeof import('../../../src/steam/LocalSteamDataWriter')>()
    return {
        LocalSteamDataWriter: {
            writeLocalAppMetadata: writeLocalAppMetadataMock,
            mergeCollectionsForAppids: mergeCollectionsForAppidsMock,
            readCollectionsByAppid: actual.LocalSteamDataWriter.readCollectionsByAppid,
        },
    }
})

const { getManyMock, findMissingArtworkMock } = vi.hoisted(() => ({
    getManyMock: vi.fn(),
    findMissingArtworkMock: vi.fn(),
}))

vi.mock('../../../src/steam/cache/AppDetailsCache', () => ({
    AppDetailsCache: {
        getMany: getManyMock,
        findMissingArtwork: findMissingArtworkMock,
    },
}))

const { fetchAndCacheAppDetailsMock } = vi.hoisted(() => ({
    fetchAndCacheAppDetailsMock: vi.fn(),
}))

vi.mock('../../../src/steam/SteamApiClient', () => ({
    SteamApiClient: {
        getInstance: () => ({
            gamesLoader: {
                fetchAndCacheAppDetails: fetchAndCacheAppDetailsMock,
            },
        }),
    },
}))

const { findLocalArtMock } = vi.hoisted(() => ({
    findLocalArtMock: vi.fn(),
}))

vi.mock('../../../src/steam/LocalLibraryArtReader', () => ({
    LocalLibraryArtReader: {
        findLocalArt: findLocalArtMock,
    },
}))

const { registerLocalArtIndexMock } = vi.hoisted(() => ({
    registerLocalArtIndexMock: vi.fn(),
}))

vi.mock('../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: {
        getInstance: () => ({
            registerLocalArtIndex: registerLocalArtIndexMock,
        }),
    },
}))

import { loadLocalSteamLibrary, buildLibraryGames, registerLocalLibraryArt } from '../../../src/steam/LocalSteamLibraryLoader'
import type { AppDetailsData } from '../../../src/steam/batch/BatchAppDetailsClient'

const NO_ARTWORK: AppDetailsData['artwork'] = {
    header: null, capsule: null, capsule_v5: null, background: null, background_raw: null,
}

function makeEntry(name: string): AppDetailsData {
    return { type: 'game', name, is_free: false, artwork: NO_ARTWORK }
}

describe('LocalSteamLibraryLoader', () => {
    beforeEach(() => {
        invokeMock.mockReset()
        isTauriMock.mockReset()
        writeLocalAppMetadataMock.mockReset().mockResolvedValue(new Map())
        mergeCollectionsForAppidsMock.mockReset().mockResolvedValue(undefined)
        getManyMock.mockReset().mockResolvedValue(new Map())
        findMissingArtworkMock.mockReset().mockResolvedValue([])
        fetchAndCacheAppDetailsMock.mockReset().mockResolvedValue(new Map())
        findLocalArtMock.mockReset().mockResolvedValue([])
        registerLocalArtIndexMock.mockReset()
    })

    describe('buildLibraryGames', () => {
        it('joins the candidate set against resolved entries, defaulting playtime for collection-only appids', () => {
            const candidateAppids = new Set([620, 240])
            const playtimesByAppid = new Map([[620, { appid: 620, last_played: 1000, playtime_minutes: 60 }]])
            const entries = new Map<number, AppDetailsData>([
                [620, makeEntry('Portal 2')],
                [240, makeEntry('Counter-Strike: Source')],
            ])

            const games = buildLibraryGames(candidateAppids, playtimesByAppid, entries)

            expect(games).toEqual([
                { appid: 620, name: 'Portal 2', playtimeForever: 60, lastPlayed: 1000 },
                { appid: 240, name: 'Counter-Strike: Source', playtimeForever: 0, lastPlayed: undefined },
            ])
        })

        it('drops candidate appids with no resolved entry', () => {
            const games = buildLibraryGames(new Set([999]), new Map(), new Map())
            expect(games).toEqual([])
        })
    })

    describe('loadLocalSteamLibrary', () => {
        it('returns a null library on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            const result = await loadLocalSteamLibrary()
            expect(result.library).toBeNull()
            expect(invokeMock).not.toHaveBeenCalled()
            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
        })

        it('returns a null library (with steamId if known) when neither playtime nor collections yield any candidate appid', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })

            const result = await loadLocalSteamLibrary()

            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
            expect(result.library).toBeNull()
            expect(result.steamId).toBe('1')
        })

        it('includes a collection-only appid (no playtime) once network-resolved', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'CoolGamer', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([{ id: 'from-tag-Ze Done', name: 'Ze Done', appids: [620, 400] }])
                }
                throw new Error(`unexpected command ${command}`)
            })
            // 620 already resolved locally/previously cached; 400 (collection-only, never played) is new.
            findMissingArtworkMock.mockResolvedValue([400])
            fetchAndCacheAppDetailsMock.mockResolvedValue(new Map([[400, makeEntry('Portal')]]))
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([
                [620, makeEntry('Portal 2')],
                [400, makeEntry('Portal')],
            ]))

            const result = await loadLocalSteamLibrary()

            expect(findMissingArtworkMock).toHaveBeenCalledWith(expect.arrayContaining([620, 400]))
            expect(fetchAndCacheAppDetailsMock).toHaveBeenCalledWith([400])

            // 400 has no local appinfo.vdf entry (resolved via network gap-fill instead), so it
            // would never get user_collections from writeLocalAppMetadata's own pass alone - the
            // backfill must run with the full candidate set and real collection membership.
            expect(mergeCollectionsForAppidsMock).toHaveBeenCalledWith(
                new Set([620, 400]),
                new Map([[620, [{ id: 'from-tag-Ze Done', name: 'Ze Done' }]], [400, [{ id: 'from-tag-Ze Done', name: 'Ze Done' }]]])
            )

            expect(result.library).not.toBeNull()
            const gamesByAppid = new Map(result.library!.games.map(g => [g.appid, g]))
            expect(gamesByAppid.get(620)).toMatchObject({ name: 'Portal 2', playtimeForever: 60 })
            expect(gamesByAppid.get(400)).toMatchObject({ name: 'Portal', playtimeForever: 0 })
            expect(result.library!.provenance.channel).toBe('local-scan')
            expect(result.library!.owner).toEqual({ steamId: '1', displayName: 'CoolGamer' })
        })

        it('skips the network fetch entirely when nothing is missing from AppDetailsCache', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            findMissingArtworkMock.mockResolvedValue([])
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))

            await loadLocalSteamLibrary()

            expect(fetchAndCacheAppDetailsMock).not.toHaveBeenCalled()
        })

        it('proceeds without those appids when the network gap-fill fetch fails', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') {
                    return Promise.resolve([{ id: 'from-tag-Ze Done', name: 'Ze Done', appids: [400] }])
                }
                throw new Error(`unexpected command ${command}`)
            })
            findMissingArtworkMock.mockResolvedValue([400])
            fetchAndCacheAppDetailsMock.mockRejectedValue(new Error('Lambda unreachable'))
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))

            const result = await loadLocalSteamLibrary()

            expect(result.library).not.toBeNull()
            expect(result.library!.games.map(g => g.appid)).toEqual([620])
        })

        it('omits displayName/steamId when read_steam_identity fails', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.reject(new Error('no identity'))
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))

            const result = await loadLocalSteamLibrary()

            expect(result.library).not.toBeNull()
            expect(result.library!.owner.displayName).toBeUndefined()
            expect(result.library!.owner.steamId).toBeUndefined()
        })


        it('returns a null library when no candidate appid ends up with a resolved entry', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            getManyMock.mockResolvedValue(new Map())

            const result = await loadLocalSteamLibrary()

            expect(result.library).toBeNull()
            expect(result.steamId).toBe('1')
        })
    })

    describe('registerLocalLibraryArt', () => {
        // Exported and called directly from SteamIntegration.applyLibrary() rather than from
        // loadLocalSteamLibrary() above - the startup waterfall's most common case (a persisted-
        // library cache hit) never runs loadLocalSteamLibrary() at all, so testing this via that
        // function would miss the case that actually matters on a returning user's launch.
        it('scans local librarycache for the given appids and registers whatever is found', async () => {
            const entries = [{ appid: 620, library: { relative_path: 'library_600x900.jpg' } }]
            findLocalArtMock.mockResolvedValue(entries)

            await registerLocalLibraryArt(new Set([620, 440]))

            expect(findLocalArtMock).toHaveBeenCalledWith(expect.arrayContaining([620, 440]))
            expect(registerLocalArtIndexMock).toHaveBeenCalledWith(entries)
        })

        it('proceeds without throwing when the librarycache scan fails', async () => {
            findLocalArtMock.mockRejectedValue(new Error('scan failed'))

            await expect(registerLocalLibraryArt(new Set([620]))).resolves.toBeUndefined()

            expect(registerLocalArtIndexMock).not.toHaveBeenCalled()
        })
    })
})
