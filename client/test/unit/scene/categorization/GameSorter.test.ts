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

import { ARRANGEMENT_SHELF_CAP, GameSorter } from '../../../../src/scene/categorization/GameSorter'

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

function lastEmittedPayload(eventType: string): any {
    const calls = mockEmit.mock.calls.filter(([type]) => type === eventType)
    expect(calls.length).toBeGreaterThan(0)
    return calls[calls.length - 1][1]
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

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        const totalGames = payload.sections.reduce((sum: number, s: any) => sum + s.games.length, 0)
        expect(totalGames).toBe(2)
    })

    it('emits SectionsComputed before placement and ready events', () => {
        mockGames = [makeGame(1), makeGame(2), makeGame(3)]
        new GameSorter()

        fireGameDataReady()

        const emittedTypes = mockEmit.mock.calls.map(([eventType]) => eventType)
        expect(emittedTypes).toContain(GameEventTypes.SectionsComputed)
        expect(emittedTypes).toContain(GameEventTypes.SectionsReadyForPlacement)
        expect(emittedTypes).toContain(GameEventTypes.SectionsReady)

        const computedIndex = emittedTypes.indexOf(GameEventTypes.SectionsComputed)
        const placementReadyIndex = emittedTypes.indexOf(GameEventTypes.SectionsReadyForPlacement)
        const readyIndex = emittedTypes.indexOf(GameEventTypes.SectionsReady)
        expect(computedIndex).toBeLessThan(placementReadyIndex)
        expect(computedIndex).toBeLessThan(readyIndex)

        const computed = lastEmittedPayload(GameEventTypes.SectionsComputed)
        expect(Array.isArray(computed.sections)).toBe(true)
        expect(computed.sections.length).toBeGreaterThan(0)
        expect(computed.sections[0]).toMatchObject({
            sectionId: expect.any(String),
            sectionIndex: expect.any(Number),
            section: expect.any(Object),
        })

        const placement = lastEmittedPayload(GameEventTypes.SectionsReadyForPlacement)
        expect(Array.isArray(placement.sections)).toBe(true)
        if (placement.sections.length > 0) {
            expect(placement.sections[0]).toMatchObject({
                sectionId: expect.any(String),
                sectionIndex: expect.any(Number),
                section: expect.any(Object),
            })
        }
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

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        const actionSection = payload.sections.find((section: any) => section.name === 'Action')
        const rpgSection = payload.sections.find((section: any) => section.name === 'RPG')

        expect(actionSection.games).toHaveLength(1)
        expect(rpgSection.games).toHaveLength(1)
        expect(actionSection.games[0].appid).toBe(1)
        expect(rpgSection.games[0].appid).toBe(1)
    })

    it('preserves overlap across sections without within-section duplication', () => {
        mockIsAnonymous = true
        mockGames = [
            {
                ...makeGame(1, 0, 100),
                genres: [
                    { id: '1', description: 'Action' },
                    { id: '2', description: 'RPG' },
                ],
            } as SteamGameData,
            {
                ...makeGame(2, 0, 80),
                genres: [
                    { id: '3', description: 'Action' },
                    { id: '4', description: 'Shooter' },
                ],
            } as SteamGameData,
            {
                ...makeGame(3, 0, 60),
                genres: [
                    { id: '5', description: 'RPG' },
                ],
            } as SteamGameData,
        ]

        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        const actionSection = payload.sections.find((section: any) => section.name === 'Action')
        const rpgSection = payload.sections.find((section: any) => section.name === 'RPG')
        const shooterSection = payload.sections.find((section: any) => section.name === 'Shooter')

        expect(actionSection.games.map((game: any) => game.appid)).toEqual([1, 2])
        expect(rpgSection.games.map((game: any) => game.appid)).toEqual([1, 3])
        expect(shooterSection.games.map((game: any) => game.appid)).toEqual([2])

        const actionIds = actionSection.games.map((game: any) => game.appid)
        const rpgIds = rpgSection.games.map((game: any) => game.appid)
        expect(new Set(actionIds).size).toBe(actionIds.length)
        expect(new Set(rpgIds).size).toBe(rpgIds.length)
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

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        expect(payload.groupMode).toBe('by-recency')
        expect(payload.sortMode).toBe('by-last-played')
    })

    it('default arrangement for anonymous: groupMode=by-genre, sortMode=by-playtime', () => {
        mockIsAnonymous = true
        mockGames = [makeGame(1, 0, 100, 'Action')]
        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('default arrangement is by-user-collection when coverage crosses the configured threshold', () => {
        mockIsAnonymous = false
        mockGames = [
            { ...makeGame(1, 0, 100), user_collections: ['Ze Done'] } as SteamGameData,
            { ...makeGame(2, 0, 50), user_collections: ['Meh'] } as SteamGameData,
            makeGame(3, 0, 20),
        ]
        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        expect(payload.groupMode).toBe('by-user-collection')
        expect(payload.sortMode).toBe('by-last-played')
    })

    it('falls back past by-user-collection when coverage is below the configured threshold', () => {
        mockIsAnonymous = false
        mockGames = [
            { ...makeGame(1, 100, 100), user_collections: ['Ze Done'] } as SteamGameData,
            makeGame(2, 0, 50),
            makeGame(3, 0, 20),
        ]
        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        expect(payload.groupMode).toBe('by-recency')
    })

    it('produces only Never Played section when no recently-played data exists', () => {
        mockGames = [makeGame(1, 0), makeGame(2, 0)]
        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
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

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        const allGames = payload.sections.flatMap((s: any) => s.games)
        expect(allGames[0].appid).toBe(2)
        expect(allGames[1].appid).toBe(1)
    })

    it('produces a Today section for recently-played games', () => {
        const now = Math.floor(Date.now() / 1000)
        mockGames = [makeGame(1, now - 3600)]
        new GameSorter()
        fireGameDataReady()

        const payload = lastEmittedPayload(GameEventTypes.SectionsReady)
        const sectionNames: string[] = payload.sections.map((s: any) => s.name)
        expect(sectionNames).toContain('Played Today')
    })

    it('re-arranges on ArrangementRequested', () => {
        mockGames = [makeGame(1, 0, 100, 'Action')]
        new GameSorter()
        fireGameDataReady()
        mockEmit.mockReset()

        fireArrangementRequested('by-genre', 'by-playtime')

        const sectionsPayload = lastEmittedPayload(GameEventTypes.SectionsReady)
        expect(sectionsPayload.groupMode).toBe('by-genre')
        expect(sectionsPayload.sortMode).toBe('by-playtime')
    })

    it('does not emit on ArrangementRequested when no games present', () => {
        mockGames = []
        new GameSorter()
        fireArrangementRequested('by-genre', 'by-playtime')
        // With no games, no event is emitted
        expect(mockEmit).not.toHaveBeenCalled()
    })
})

describe('GameSorter placement trimming', () => {
    function makeSectionForPlanner(sectionName: string, shelfCount: number) {
        return {
            sectionId: `by-genre:${sectionName}:0`,
            section: {
                name: sectionName,
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
                games: Array.from({ length: shelfCount * 18 }, (_, index) => makeGame(index + 1)),
            },
        } as any
    }

    it('trims largest sections first using proportional passes', () => {
        const sorter = new GameSorter() as any
        const sections = [
            makeSectionForPlanner('Action', ARRANGEMENT_SHELF_CAP),
            makeSectionForPlanner('RPG', 1),
            makeSectionForPlanner('Indie', 1),
            makeSectionForPlanner('Puzzle', 1),
        ]

        const sectionPlans = sorter.buildSectionPlacementPlan(sections)
        const planById = new Map<string, { allocatedShelves: number }>(
            sectionPlans.map((section: any) => [section.sectionId, section])
        )

        expect(planById.get('by-genre:Action:0')?.allocatedShelves).toBe(ARRANGEMENT_SHELF_CAP - 3)
        expect(planById.get('by-genre:RPG:0')?.allocatedShelves).toBe(1)
        expect(planById.get('by-genre:Indie:0')?.allocatedShelves).toBe(1)
        expect(planById.get('by-genre:Puzzle:0')?.allocatedShelves).toBe(1)
    })

    it('safeguards section-overflow edge case by dropping trailing sections in sort order', () => {
        const sorter = new GameSorter() as any
        const sections = Array.from({ length: 120 }, (_, index) =>
            makeSectionForPlanner(`Section-${index}`, 1)
        )

        const sectionPlans = sorter.buildSectionPlacementPlan(sections)
        const retainedCount = sectionPlans.filter((section: any) => section.allocatedShelves > 0).length

        expect(retainedCount).toBe(ARRANGEMENT_SHELF_CAP)
        expect(sectionPlans[ARRANGEMENT_SHELF_CAP - 1].allocatedShelves).toBe(1)
        expect(sectionPlans[ARRANGEMENT_SHELF_CAP].allocatedShelves).toBe(0)
    })

    it('does not drop tail sections when shelf pressure is high but section count is still under cap', () => {
        const sorter = new GameSorter() as any
        const sectionCount = Math.max(1, ARRANGEMENT_SHELF_CAP - 1)
        const sections = Array.from({ length: sectionCount }, (_, index) =>
            makeSectionForPlanner(`Section-${index}`, 2)
        )

        const sectionPlans = sorter.buildSectionPlacementPlan(sections)
        const retainedCount = sectionPlans.filter((section: any) => section.allocatedShelves > 0).length

        expect(retainedCount).toBe(sectionCount)
        expect(sectionPlans[sectionCount - 1].allocatedShelves).toBeGreaterThan(0)
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
