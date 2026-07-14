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

import { EventManager } from '../../../src/core/EventManager'
import { SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../../../src/types/InteractionEvents'
import { loadLocalSteamLibrary, buildImportedGames } from '../../../src/steam/LocalSteamLibraryLoader'
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
        writeLocalAppMetadataMock.mockReset()
        EventManager.getInstance().removeAllListeners()
    })

    describe('buildImportedGames', () => {
        it('joins playtime numbers against written entries by appid, dropping unmatched appids', () => {
            const playtimes = [
                { appid: 620, last_played: 1000, playtime_minutes: 60 },
                { appid: 999, last_played: null, playtime_minutes: 5 },
            ]
            const entries = new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]])

            const games = buildImportedGames(playtimes, entries)

            expect(games).toEqual([
                { appid: 620, name: 'Portal 2', playtime_forever: 60, rtime_last_played: 1000 },
            ])
        })

        it('defaults playtime_forever to 0 and omits rtime_last_played when null', () => {
            const playtimes = [{ appid: 620, last_played: null, playtime_minutes: null }]
            const entries = new Map<number, AppDetailsData>([[620, makeEntry('Portal 2')]])

            const games = buildImportedGames(playtimes, entries)

            expect(games).toEqual([
                { appid: 620, name: 'Portal 2', playtime_forever: 0, rtime_last_played: undefined },
            ])
        })
    })

    describe('loadLocalSteamLibrary', () => {
        it('no-ops on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            await loadLocalSteamLibrary()
            expect(invokeMock).not.toHaveBeenCalled()
            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
        })

        it('no-ops when the local playtime scan finds no appids', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') return Promise.resolve([])
                throw new Error(`unexpected command ${command}`)
            })

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(writeLocalAppMetadataMock).not.toHaveBeenCalled()
            expect(handler).not.toHaveBeenCalled()
        })

        it('emits ImportLibrary with channel local-scan and the resolved persona name when games resolve', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') {
                    return Promise.resolve({ steamid64: '76500000000000001', account_name: 'acct', persona_name: 'CoolGamer', most_recent: true })
                }
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                throw new Error(`unexpected command ${command}`)
            })
            writeLocalAppMetadataMock.mockResolvedValue(new Map([[620, makeEntry('Portal 2')]]))

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>
            expect(event.detail.channel).toBe('local-scan')
            expect(event.detail.displayName).toBe('CoolGamer')
            expect(event.detail.steamId).toBe('76500000000000001')
            expect(event.detail.games).toEqual([
                { appid: 620, name: 'Portal 2', playtime_forever: 60, rtime_last_played: 1000 },
            ])
        })

        it('proceeds without identity when read_steam_identity fails, omitting displayName/steamId', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.reject(new Error('no identity'))
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                throw new Error(`unexpected command ${command}`)
            })
            writeLocalAppMetadataMock.mockResolvedValue(new Map([[620, makeEntry('Portal 2')]]))

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).toHaveBeenCalledTimes(1)
            const event = handler.mock.calls[0][0] as CustomEvent<SteamImportLibraryEvent>
            expect(event.detail.displayName).toBeUndefined()
            expect(event.detail.steamId).toBeUndefined()
        })

        it('does not emit when no playtimed appid has a resolvable local name', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockImplementation((command: string) => {
                if (command === 'read_steam_identity') return Promise.resolve({ steamid64: '1', account_name: 'a', persona_name: 'A', most_recent: true })
                if (command === 'read_steam_playtimes') {
                    return Promise.resolve([{ appid: 620, last_played: 1000, playtime_minutes: 60 }])
                }
                throw new Error(`unexpected command ${command}`)
            })
            writeLocalAppMetadataMock.mockResolvedValue(new Map())

            const handler = vi.fn()
            EventManager.getInstance().registerEventHandler(SteamEventTypes.ImportLibrary, handler)

            await loadLocalSteamLibrary()

            expect(handler).not.toHaveBeenCalled()
        })
    })
})
