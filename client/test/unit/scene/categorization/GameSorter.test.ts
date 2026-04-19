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

let mockIsAnonymous = false
vi.mock('../../../../src/steam-integration/SteamIntegration', () => ({
    SteamIntegration: {
        getInstance: () => ({
            isAnonymous: () => mockIsAnonymous,
        }),
    },
}))

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

    it('emits SectionsReady when AllBatchesComplete fires with games', () => {
        mockGames = [makeGame(1), makeGame(2)]
        new GameSorter()
        fireAllBatchesComplete()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.SectionsReady)
        const totalGames = payload.sections.reduce((sum: number, s: any) => sum + s.games.length, 0)
        expect(totalGames).toBe(2)
    })

    it('does NOT emit when there are no games', () => {
        mockGames = []
        new GameSorter()
        fireAllBatchesComplete()
        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('produces only Unplayed section when no recently-played data exists', () => {
        mockGames = [makeGame(1, 0), makeGame(2, 0)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        expect(payload.sections).toHaveLength(1)
        expect(payload.sections[0].name).toBe('Never Played')
        expect(payload.sections[0].games).toHaveLength(2)
    })

    it('sorts by recently played — most recent section first', () => {
        const now = Math.floor(Date.now() / 1000)
        const older = now - 60 * 60 * 24 * 10
        const newer = now - 3600
        mockGames = [makeGame(1, older), makeGame(2, newer)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        const allGames = payload.sections.flatMap((s: any) => s.games)
        expect(allGames[0].appid).toBe(2)
        expect(allGames[1].appid).toBe(1)
    })

    it('produces a Today section for recently-played games', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600)]
        new GameSorter()
        fireAllBatchesComplete()

        const [, payload] = mockEmit.mock.calls[0]
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames).toContain('Played Today')
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

    it('emits SectionsReady sorted descending by playtime_forever', () => {
        mockGames = [makeGame(1, 0, 100), makeGame(2, 0, 500), makeGame(3, 0, 50)]
        const sorter = new GameSorter()
        sorter.sortByPlaytime()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.SectionsReady)
        const allGames = payload.sections.flatMap((s: any) => s.games)
        expect(allGames[0].appid).toBe(2)  // 500 minutes
        expect(allGames[1].appid).toBe(1)  // 100 minutes
        expect(allGames[2].appid).toBe(3)  // 50 minutes
    })

    it('does not emit when no games present', () => {
        mockGames = []
        const sorter = new GameSorter()
        sorter.sortByPlaytime()
        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('emits sections with playtime bucket names', () => {
        mockGames = [makeGame(1, 0, 6_001), makeGame(2, 0, 600), makeGame(3, 0, 0)]
        const sorter = new GameSorter()
        sorter.sortByPlaytime()
        const [, payload] = mockEmit.mock.calls[0]
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames).toContain('Played 100+ Hours')
        expect(sectionNames).toContain('Played 10\u2013100 Hours')
        expect(sectionNames).toContain('Never Played')
    })
})

describe('GameSorter.sortByRating', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
    })

    it('emits SectionsReady sorted descending by userscore, breaking ties with playtime', () => {
        const g1 = makeGame(1, 0, 100); g1.userscore = 95
        const g2 = makeGame(2, 0, 500); g2.userscore = 95
        const g3 = makeGame(3, 0, 50);  g3.userscore = 85
        const g4 = makeGame(4, 0, 1000)

        mockGames = [g1, g2, g3, g4]
        const sorter = new GameSorter()
        sorter.sortByRating()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.SectionsReady)
        const allGames = payload.sections.flatMap((s: any) => s.games)
        expect(allGames[0].appid).toBe(2)
        expect(allGames[1].appid).toBe(1)
        expect(allGames[2].appid).toBe(3)
        expect(allGames[3].appid).toBe(4)
    })

    it('does not emit when no games present', () => {
        mockGames = []
        const sorter = new GameSorter()
        sorter.sortByRating()
        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('emits sections with rating tier names', () => {
        const g1 = makeGame(1, 0, 100); g1.userscore = 92
        const g2 = makeGame(2, 0, 100); g2.userscore = 85
        const g3 = makeGame(3, 0, 100); g3.userscore = 75
        const g4 = makeGame(4, 0, 100); g4.userscore = 50
        const g5 = makeGame(5, 0, 100)

        mockGames = [g1, g2, g3, g4, g5]
        const sorter = new GameSorter()
        sorter.sortByRating()

        const [, payload] = mockEmit.mock.calls[0]
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames).toContain('Overwhelmingly Positive')
        expect(sectionNames).toContain('Very Positive')
        expect(sectionNames).toContain('Mostly Positive')
        expect(sectionNames).toContain('Mixed or Lower')
        expect(sectionNames).toContain('Unrated')
    })
})

describe('GameSorter.sortByGenre', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
    })

    it('emits SectionsReady grouped by genre in KNOWN_GENRES order', () => {
        mockGames = [
            makeGame(1, 0, 10, 'RPG'),
            makeGame(2, 0, 10, 'Action'),
            makeGame(3, 0, 10, 'Strategy'),
        ]
        const sorter = new GameSorter()
        sorter.sortByGenre()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.SectionsReady)
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames.indexOf('Action')).toBeLessThan(sectionNames.indexOf('RPG'))
        expect(sectionNames.indexOf('RPG')).toBeLessThan(sectionNames.indexOf('Strategy'))
    })

    it('sorts by playtime descending within the same genre section', () => {
        mockGames = [
            makeGame(1, 0, 30, 'Action'),
            makeGame(2, 0, 100, 'Action'),
            makeGame(3, 0, 10, 'Action'),
        ]
        const sorter = new GameSorter()
        sorter.sortByGenre()

        const [, payload] = mockEmit.mock.calls[0]
        const actionSection = payload.sections.find((s: any) => s.name === 'Action')
        expect(actionSection).toBeDefined()
        expect(actionSection.games[0].appid).toBe(2)  // 100 min
        expect(actionSection.games[1].appid).toBe(1)  // 30 min
        expect(actionSection.games[2].appid).toBe(3)  // 10 min
    })

    it('does not emit when no games present', () => {
        mockGames = []
        const sorter = new GameSorter()
        sorter.sortByGenre()
        expect(mockEmit).not.toHaveBeenCalled()
    })
})
