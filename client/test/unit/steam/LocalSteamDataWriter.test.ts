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

import { LocalSteamDataWriter } from '../../../src/steam/LocalSteamDataWriter'
import { AppDetailsCache } from '../../../src/steam/cache/AppDetailsCache'

describe('LocalSteamDataWriter', () => {
    beforeEach(() => {
        setupIndexedDBMock()
        invokeMock.mockReset()
        isTauriMock.mockReset()
    })

    describe('buildAppDetailsEntry', () => {
        it('returns null when appinfo.vdf has no name for this appid', () => {
            const entry = LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: null,
                developers: [],
                publishers: [],
                tags: [],
            })
            expect(entry).toBeNull()
        })

        it('builds a valid entry with rank-derived descending tag weights', () => {
            const entry = LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: 'Portal 2',
                developers: ['Valve'],
                publishers: ['Valve'],
                tags: ['Singleplayer', 'Puzzle', 'Co-op'],
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

        it('omits developers/publishers/steamspy_tags when empty rather than storing empty arrays', () => {
            const entry = LocalSteamDataWriter.buildAppDetailsEntry({
                appid: 620,
                name: 'Portal 2',
                developers: [],
                publishers: [],
                tags: [],
            })
            expect(entry?.developers).toBeUndefined()
            expect(entry?.publishers).toBeUndefined()
            expect(entry?.steamspy_tags).toBeUndefined()
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
                        { appid: 620, name: 'Portal 2', developers: ['Valve'], publishers: ['Valve'], tags: ['Puzzle'] },
                        { appid: 999, name: null, developers: [], publishers: [], tags: [] },
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
