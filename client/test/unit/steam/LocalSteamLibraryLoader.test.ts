import { describe, it, expect, beforeEach, vi } from 'vitest'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
    isTauriMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
    isTauri: isTauriMock,
}))

const { writeLocalAppMetadataMock } = vi.hoisted(() => ({
    writeLocalAppMetadataMock: vi.fn(),
}))

vi.mock('../../../src/steam/LocalSteamDataWriter', () => ({
    LocalSteamDataWriter: {
        writeLocalAppMetadata: writeLocalAppMetadataMock,
    },
}))

const { getManyMock, findMissingMock } = vi.hoisted(() => ({
    getManyMock: vi.fn(),
    findMissingMock: vi.fn(),
}))

vi.mock('../../../src/steam/cache/AppDetailsCache', () => ({
    AppDetailsCache: {
        getMany: getManyMock,
        findMissing: findMissingMock,
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

import { EventManager } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'
import { loadLocalSteamLibrary, buildImportedGames } from '../../../src/steam/LocalSteamLibraryLoader'
import { persistLibrary } from '../../../src/steam-integration/LibraryStore'
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
        getManyMock.mockReset().mockResolvedValue(new Map())
        findMissingMock.mockReset().mockResolvedValue([])
        fetchAndCacheAppDetailsMock.mockReset().mockResolvedValue(new Map())
        EventManager.getInstance().removeAllListeners()
        localStorage.clear()
    })

    describe('buildImportedGames', () => {
        it('joins the candidate set against resolved entries, defaulting playtime for collection-only appids', () => {
            const candidateAppids = new Set([620, 240])
            const playtimesByAppid = new Map([[620, { appid: 620, last_played: 1000, playtime_minutes: 60 }]])
            const entries = new Map<number, AppDetailsData>([
                [620, makeEntry('Portal 2')],
                [240, makeEntry('Counter-Strike: Source')],
            ])

            const games = buildImportedGames(candidateAppids, playtimesByAppid, entries)

            expect(games).toEqual([
                { appid: 620, name: 'Portal 2', playtime_forever: 60, rtime_last_played: 1000 },
                { appid: 240, name: 'Counter-Strike: Source', playtime_forever: 0, rtime_last_played: undefined },
            ])
        })

        it('drops candidate appids with no resolved entry', () => {
            const games = buildImportedGames(new Set([999]), new Map(), new Map())
            expect(games).toEqual([])
        })
    })

    describe('loadLocalSteamLibrary', () => {
        it('no-ops on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            await loadLocalSteamLibrary()
            expect(invokeMock).not.toHaveBeenCalled()
            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
        })

        it('no-ops when neither playtime nor collections yield any candidate appid', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
            expect(handler).not.toHaveBeenCalled()
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
            findMissingMock.mockResolvedValue([400])
            fetchAndCacheAppDetailsMock.mockResolvedValue(new Map([[400, makeEntry('Portal')]]))
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([
                [620, makeEntry('Portal 2')],
                [400, makeEntry('Portal')],
            ]))

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(findMissingMock).toHaveBeenCalledWith(expect.arrayContaining([620, 400]))
            expect(fetchAndCacheAppDetailsMock).toHaveBeenCalledWith([400])

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>
            const gamesByAppid = new Map(event.detail.games.map(g => [g.appid, g]))
            expect(gamesByAppid.get(620)).toMatchObject({ name: 'Portal 2', playtime_forever: 60 })
            expect(gamesByAppid.get(400)).toMatchObject({ name: 'Portal', playtime_forever: 0 })
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
            findMissingMock.mockResolvedValue([])
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
            findMissingMock.mockResolvedValue([400])
            fetchAndCacheAppDetailsMock.mockRejectedValue(new Error('Lambda unreachable'))
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>
            expect(event.detail.games.map(g => g.appid)).toEqual([620])
        })

        it('proceeds without identity when read_steam_identity fails, omitting displayName/steamId', async () => {
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

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>
            expect(event.detail.displayName).toBeUndefined()
            expect(event.detail.steamId).toBeUndefined()
        })

        it('skips emitting ImportLibrary when the scan reproduces the persisted local-scan library', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))
            persistLibrary({
                owner: { steamId: '1', displayName: 'A' },
                games: [{ appid: 620, name: 'Portal 2', playtimeForever: 999 }],
                provenance: { channel: 'local-scan', capturedAt: '2026-01-01T00:00:00Z' },
            })

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).not.toHaveBeenCalled()
        })

        it('still emits ImportLibrary when the scan differs from the persisted library', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                if (command === 'read_steam_collections') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })
            getManyMock.mockResolvedValue(new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]]))
            persistLibrary({
                owner: { steamId: '1', displayName: 'A' },
                games: [{ appid: 999, name: 'Some Other Game', playtimeForever: 0 }],
                provenance: { channel: 'local-scan', capturedAt: '2026-01-01T00:00:00Z' },
            })

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).toHaveBeenCalledTimes(1)
        })


        it('does not emit when no candidate appid ends up with a resolved entry', async () => {
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

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).not.toHaveBeenCalled()
        })
    })
})
