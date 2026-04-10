import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SteamGameData } from '../game-box/types/GameData'
import { GameEventTypes } from '../../types/InteractionEvents'
import { RecentlyPlayedBucket } from './GameSorter'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockHandlers = new Map<string, Array<(e: CustomEvent) => void>>()
const mockEmit = vi.fn()

vi.mock('../../core/EventManager', () => ({
    EventManager: {
        getInstance: () => ({
            registerEventHandler: vi.fn((type: string, fn: (e: CustomEvent) => void) => {
                const list = mockHandlers.get(type) ?? []
                list.push(fn)
                mockHandlers.set(type, list)
            }),
            emit: mockEmit,
        }),
    },
}))

let mockGames: SteamGameData[] = []

vi.mock('../../core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: () => mockGames,
        }),
    },
}))

// Import after mocks are hoisted
import { GameSorter } from './GameSorter'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGame(appid: number, rtime_last_played = 0): SteamGameData {
    return {
        appid,
        name: `Game ${appid}`,
        playtime_forever: 0,
        rtime_last_played,
        img_icon_url: '',
        img_logo_url: '',
    } as SteamGameData
}

function fireAllBatchesComplete(): void {
    const handlers = mockHandlers.get(GameEventTypes.AllBatchesComplete) ?? []
    const event = new CustomEvent(GameEventTypes.AllBatchesComplete, { detail: {} })
    for (const h of handlers) h(event)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GameSorter', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
    })

    it('subscribes to AllBatchesComplete on construction', () => {
        new GameSorter()
        expect(mockHandlers.has(GameEventTypes.AllBatchesComplete)).toBe(true)
    })

    it('emits GamesSort when AllBatchesComplete fires with games', () => {
        mockGames = [makeGame(1), makeGame(2)]
        new GameSorter()
        fireAllBatchesComplete()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.GamesSort)
        expect(payload.sortedGames).toHaveLength(2)
        expect(payload.hasRecentlyPlayedData).toBe(false)
    })

    it('does NOT emit GamesSort when there are no games', () => {
        mockGames = []
        new GameSorter()
        fireAllBatchesComplete()

        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('sets hasRecentlyPlayedData=true when any game has rtime_last_played > 0', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600), makeGame(2, 0)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        expect(payload.hasRecentlyPlayedData).toBe(true)
    })

    it('sorts by recently played when hasRecentlyPlayedData is true', () => {
        const now = Math.floor(Date.now() / 1000)
        const older = now - 60 * 60 * 24 * 10   // 10 days ago
        const newer = now - 3600                  // 1 hour ago
        mockGames = [makeGame(1, older), makeGame(2, newer)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        // newer played first (most-recently-played = first)
        expect((payload.sortedGames[0] as SteamGameData).appid).toBe(2)
        expect((payload.sortedGames[1] as SteamGameData).appid).toBe(1)
    })

    it('builds a bucket map with labels for recently-played games', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600)] // played today
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        const buckets: ReadonlyMap<string, string> = payload.buckets
        expect(buckets.has(RecentlyPlayedBucket.Today)).toBe(true)
        expect(buckets.get(RecentlyPlayedBucket.Today)).toBe('Played Today')
    })

    it('emits an empty bucket map when hasRecentlyPlayedData is false', () => {
        mockGames = [makeGame(1, 0), makeGame(2, 0)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        expect((payload.buckets as ReadonlyMap<string, string>).size).toBe(0)
    })
})
