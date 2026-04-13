import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'
import { GameEventTypes } from '../../../../src/types/InteractionEvents'
import { RecentlyPlayedBucket, getRecentlyPlayedBucket, getBucketLabel } from '../../../../src/scene/categorization/GameSorter'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockHandlers = new Map<string, Array<(e: CustomEvent) => void>>()
const mockEmit = vi.fn()

vi.mock('../../../../src/core/EventManager', () => ({
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

vi.mock('../../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: () => mockGames,
        }),
    },
}))

// Import after mocks are hoisted
import { GameSorter } from '../../../../src/scene/categorization/GameSorter'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeGame(appid: number, rtime_last_played = 0, playtime_forever = 0, genreDescription?: string): SteamGameData {
    return {
        appid,
        name: `Game ${appid}`,
        playtime_forever,
        rtime_last_played,
        img_icon_url: '',
        img_logo_url: '',
        ...(genreDescription ? { genres: [{ id: '1', description: genreDescription }] } : {}),
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
        expect((payload.buckets as ReadonlyMap<string, string>).size).toBe(1)
        expect((payload.buckets as ReadonlyMap<string, string>).get(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })

    it('does NOT emit GamesSort when there are no games', () => {
        mockGames = []
        new GameSorter()
        fireAllBatchesComplete()

        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('builds non-empty bucket map when any game has rtime_last_played > 0', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600), makeGame(2, 0)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        expect((payload.buckets as ReadonlyMap<string, string>).size).toBeGreaterThan(0)
    })

    it('sorts by recently played when bucket data exists', () => {
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

    it('emits only the Unplayed bucket when no recently-played data exists', () => {
        mockGames = [makeGame(1, 0), makeGame(2, 0)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        expect((payload.buckets as ReadonlyMap<string, string>).size).toBe(1)
        expect((payload.buckets as ReadonlyMap<string, string>).get(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })
})

describe('getRecentlyPlayedBucket', () => {
    const DAY = 24 * 60 * 60
    const now = 1000000000

    const game = (rtime: number | undefined) => ({
        rtime_last_played: rtime,
    } as SteamGameData)

    it('returns "unplayed" for rtime_last_played = 0 or undefined', () => {
        expect(getRecentlyPlayedBucket(game(0), now)).toBe(RecentlyPlayedBucket.Unplayed)
        expect(getRecentlyPlayedBucket(game(undefined), now)).toBe(RecentlyPlayedBucket.Unplayed)
    })

    it('returns "today" for within 24h', () => {
        expect(getRecentlyPlayedBucket(game(now - 1), now)).toBe(RecentlyPlayedBucket.Today)
        expect(getRecentlyPlayedBucket(game(now - DAY + 1), now)).toBe(RecentlyPlayedBucket.Today)
    })

    it('returns "this-week" for within 7 days', () => {
        expect(getRecentlyPlayedBucket(game(now - DAY), now)).toBe(RecentlyPlayedBucket.ThisWeek)
        expect(getRecentlyPlayedBucket(game(now - 7 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisWeek)
    })

    it('returns "this-month" for within 30 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 7 * DAY), now)).toBe(RecentlyPlayedBucket.ThisMonth)
        expect(getRecentlyPlayedBucket(game(now - 30 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisMonth)
    })

    it('returns "this-year" for within 365 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 30 * DAY), now)).toBe(RecentlyPlayedBucket.ThisYear)
        expect(getRecentlyPlayedBucket(game(now - 365 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisYear)
    })

    it('returns "before" for older than 365 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 365 * DAY), now)).toBe(RecentlyPlayedBucket.Before)
        expect(getRecentlyPlayedBucket(game(now - 1000 * DAY), now)).toBe(RecentlyPlayedBucket.Before)
    })

    it('handles future dates as "today"', () => {
        expect(getRecentlyPlayedBucket(game(now + 3600), now)).toBe(RecentlyPlayedBucket.Today)
    })
})

describe('getBucketLabel', () => {
    it('returns correct human-readable labels', () => {
        expect(getBucketLabel(RecentlyPlayedBucket.Today)).toBe('Played Today')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisWeek)).toBe('Played This Week')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisMonth)).toBe('Played This Month')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisYear)).toBe('Played This Year')
        expect(getBucketLabel(RecentlyPlayedBucket.Before)).toBe('Played Before')
        expect(getBucketLabel(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })
})

describe('GameSorter.sortByPlaytime', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
    })

    it('emits GamesSort sorted descending by playtime_forever', () => {
        mockGames = [
            makeGame(1, 0, 100),
            makeGame(2, 0, 500),
            makeGame(3, 0, 50),
        ]
        const sorter = new GameSorter()
        sorter.sortByPlaytime()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.GamesSort)
        const sorted = payload.sortedGames as SteamGameData[]
        expect(sorted[0].appid).toBe(2)  // 500 minutes
        expect(sorted[1].appid).toBe(1)  // 100 minutes
        expect(sorted[2].appid).toBe(3)  // 50 minutes
    })

    it('does not emit when no games present', () => {
        mockGames = []
        const sorter = new GameSorter()
        sorter.sortByPlaytime()
        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('emits a playtime bucket map with labels', () => {
        mockGames = [
            makeGame(1, 0, 6_001),  // Heavy: 100+ hours
            makeGame(2, 0, 600),    // Moderate: 10-100 hours
            makeGame(3, 0, 0),      // Unplayed
        ]
        const sorter = new GameSorter()
        sorter.sortByPlaytime()
        const [, payload] = mockEmit.mock.calls[0]
        const buckets = payload.buckets as ReadonlyMap<string, string>
        expect(buckets.size).toBeGreaterThan(0)
        expect(buckets.get('heavy')).toBe('100+ Hours')
        expect(buckets.get('moderate')).toBe('10–100 Hours')
        expect(buckets.get('unplayed')).toBe('Never Played')
    })
})

describe('GameSorter.sortByGenre', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
    })

    it('emits GamesSort grouped by genre in KNOWN_GENRES order', () => {
        mockGames = [
            makeGame(1, 0, 10, 'RPG'),
            makeGame(2, 0, 10, 'Action'),
            makeGame(3, 0, 10, 'Strategy'),
        ]
        const sorter = new GameSorter()
        sorter.sortByGenre()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.GamesSort)
        const sorted = payload.sortedGames as SteamGameData[]
        // Action (index 0) < RPG (index 2) < Strategy (index 3)
        expect(sorted[0].appid).toBe(2)  // Action
        expect(sorted[1].appid).toBe(1)  // RPG
        expect(sorted[2].appid).toBe(3)  // Strategy
    })

    it('sorts by playtime descending within the same genre', () => {
        mockGames = [
            makeGame(1, 0, 30, 'Action'),
            makeGame(2, 0, 100, 'Action'),
            makeGame(3, 0, 10, 'Action'),
        ]
        const sorter = new GameSorter()
        sorter.sortByGenre()

        const [, payload] = mockEmit.mock.calls[0]
        const sorted = payload.sortedGames as SteamGameData[]
        expect(sorted[0].appid).toBe(2)  // 100 min
        expect(sorted[1].appid).toBe(1)  // 30 min
        expect(sorted[2].appid).toBe(3)  // 10 min
    })

    it('does not emit when no games present', () => {
        mockGames = []
        const sorter = new GameSorter()
        sorter.sortByGenre()
        expect(mockEmit).not.toHaveBeenCalled()
    })
})
