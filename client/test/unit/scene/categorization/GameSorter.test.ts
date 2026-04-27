import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'
import { GameEventTypes, UIEventTypes } from '../../../../src/types/InteractionEvents'
import { RecentlyPlayedBucket, getRecentlyPlayedBucket, PlaytimeBucket, getPlaytimeBucket } from '../../../../src/scene/categorization/GameSorter'

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

function fireGameDataReady(): void {
    const handlers = mockHandlers.get(GameEventTypes.GameDataReady) ?? []
    const event = new CustomEvent(GameEventTypes.GameDataReady, { detail: { totalGames: mockGames.length, totalBatches: 1 } })
    for (const h of handlers) h(event)
}

function fireArrangementRequested(groupMode: string, sortMode: string): void {
    const handlers = mockHandlers.get(UIEventTypes.ArrangementRequested) ?? []
    const event = new CustomEvent(UIEventTypes.ArrangementRequested, { detail: { groupMode, sortMode } })
    for (const h of handlers) h(event)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GameSorter', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
        mockIsAnonymous = false
    })

    it('subscribes to GameDataReady on construction', () => {
        new GameSorter()
        expect(mockHandlers.has(GameEventTypes.GameDataReady)).toBe(true)
    })

    it('subscribes to ArrangementRequested on construction', () => {
        new GameSorter()
        expect(mockHandlers.has(UIEventTypes.ArrangementRequested)).toBe(true)
    })

    it('emits SectionsReady when GameDataReady fires with games', () => {
        mockGames = [makeGame(1), makeGame(2)]
        new GameSorter()
        fireGameDataReady()

        expect(mockEmit).toHaveBeenCalledOnce()
        const [eventType, payload] = mockEmit.mock.calls[0]
        expect(eventType).toBe(GameEventTypes.SectionsReady)
        const totalGames = payload.sections.reduce((sum: number, s: any) => sum + s.games.length, 0)
        expect(totalGames).toBe(2)
    })

    it('duplicates a multi-genre game across each matching genre section', () => {
        mockIsAnonymous = true
        mockGames = [
            {
                ...makeGame(1, 0, 100),
                genres: [
                    { id: '1', description: 'Action' },
                    { id: '2', description: 'RPG' },
                ],
            } as SteamGameData,
        ]

        new GameSorter()
        fireGameDataReady()

        const [, payload] = mockEmit.mock.calls[0]
        const actionSection = payload.sections.find((section: any) => section.name === 'Action')
        const rpgSection = payload.sections.find((section: any) => section.name === 'RPG')

        expect(actionSection.games).toHaveLength(1)
        expect(rpgSection.games).toHaveLength(1)
        expect(actionSection.games[0].appid).toBe(1)
        expect(rpgSection.games[0].appid).toBe(1)
    })

    it('does NOT emit when there are no games', () => {
        mockGames = []
        new GameSorter()
        fireGameDataReady()
        expect(mockEmit).not.toHaveBeenCalled()
    })

    it('default arrangement for non-anonymous: groupMode=by-recency, sortMode=by-last-played', () => {
        mockIsAnonymous = false
        mockGames = [makeGame(1, Math.floor(Date.now() / 1000) - 3600)]
        new GameSorter()
        fireGameDataReady()

        const [, payload] = mockEmit.mock.calls[0]
        expect(payload.groupMode).toBe('by-recency')
        expect(payload.sortMode).toBe('by-last-played')
    })

    it('default arrangement for anonymous: groupMode=by-genre, sortMode=by-playtime', () => {
        mockIsAnonymous = true
        mockGames = [makeGame(1, 0, 100, 'Action')]
        new GameSorter()
        fireGameDataReady()

        const [, payload] = mockEmit.mock.calls[0]
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('produces only Never Played section when no recently-played data exists', () => {
        mockGames = [makeGame(1, 0), makeGame(2, 0)]
        new GameSorter()
        fireGameDataReady()

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
        fireGameDataReady()

        const [, payload] = mockEmit.mock.calls[0]
        const allGames = payload.sections.flatMap((s: any) => s.games)
        expect(allGames[0].appid).toBe(2)
        expect(allGames[1].appid).toBe(1)
    })

    it('produces a Today section for recently-played games', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600)]
        new GameSorter()
        fireGameDataReady()

        const [, payload] = mockEmit.mock.calls[0]
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames).toContain('Played Today')
    })

    it('re-arranges on ArrangementRequested', () => {
        mockGames = [makeGame(1, 0, 100, 'Action')]
        new GameSorter()
        fireGameDataReady()
        mockEmit.mockReset()

        fireArrangementRequested('by-genre', 'by-playtime')

        // Only SectionsReady is emitted (no LayoutClearRequest intermediary)
        expect(mockEmit).toHaveBeenCalledTimes(1)
        const firstCall = mockEmit.mock.calls[0]
        expect(firstCall[0]).toBe(GameEventTypes.SectionsReady)
        expect(firstCall[1].groupMode).toBe('by-genre')
        expect(firstCall[1].sortMode).toBe('by-playtime')
    })

    it('does not emit on ArrangementRequested when no games present', () => {
        mockGames = []
        new GameSorter()
        fireArrangementRequested('by-genre', 'by-playtime')
        // With no games, no event is emitted
        expect(mockEmit).not.toHaveBeenCalled()
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
