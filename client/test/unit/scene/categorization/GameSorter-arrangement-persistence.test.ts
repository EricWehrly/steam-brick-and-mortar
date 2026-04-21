/**
 * Unit Tests: GameSorter — Arrangement Persistence Across Layout Switches
 *
 * Verifies the hasArrangedOnce fix: auth-based defaults are only applied on
 * the first GameDataReady. Subsequent GameDataReady events (triggered by
 * layout switches) re-apply the current groupMode/sortMode instead of
 * resetting to defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'
import {
    GameEventTypes,
    UIEventTypes,
    StorePropsEventTypes,
} from '../../../../src/types/InteractionEvents'

// ── Mocks ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGame(appid: number, genreDescription?: string): SteamGameData {
    return {
        appid,
        name: `Game ${appid}`,
        playtime_forever: 100,
        rtime_last_played: Math.floor(Date.now() / 1000) - 3600,
        img_icon_url: '',
        img_logo_url: '',
        ...(genreDescription ? { genres: [{ id: '1', description: genreDescription }] } : {}),
    } as SteamGameData
}

function fireGameDataReady(): void {
    const handlers = mockHandlers.get(GameEventTypes.GameDataReady) ?? []
    const event = new CustomEvent(GameEventTypes.GameDataReady, {
        detail: { totalGames: mockGames.length, totalBatches: 1 },
    })
    for (const h of handlers) h(event)
}

function fireArrangementRequested(groupMode: string, sortMode: string): void {
    const handlers = mockHandlers.get(UIEventTypes.ArrangementRequested) ?? []
    const event = new CustomEvent(UIEventTypes.ArrangementRequested, {
        detail: { groupMode, sortMode },
    })
    for (const h of handlers) h(event)
}

function fireLayoutClearRequest(): void {
    const handlers = mockHandlers.get(StorePropsEventTypes.LayoutClearRequest) ?? []
    const event = new CustomEvent(StorePropsEventTypes.LayoutClearRequest, { detail: {} })
    for (const h of handlers) h(event)
}

function lastSectionsReadyPayload(): { groupMode: string; sortMode: string } {
    const sectionsReadyCalls = mockEmit.mock.calls.filter(
        ([type]) => type === GameEventTypes.SectionsReady
    )
    expect(sectionsReadyCalls.length).toBeGreaterThan(0)
    return sectionsReadyCalls[sectionsReadyCalls.length - 1][1]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GameSorter — arrangement persistence across layout switches', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
        mockIsAnonymous = false
    })

    it('first GameDataReady for authenticated user uses defaults: by-recency / by-last-played', () => {
        mockIsAnonymous = false
        mockGames = [makeGame(1), makeGame(2)]
        new GameSorter()

        fireGameDataReady()

        const payload = lastSectionsReadyPayload()
        expect(payload.groupMode).toBe('by-recency')
        expect(payload.sortMode).toBe('by-last-played')
    })

    it('second GameDataReady preserves user-chosen arrangement after ArrangementRequested', () => {
        mockIsAnonymous = false
        mockGames = [makeGame(1, 'Action'), makeGame(2, 'RPG')]
        new GameSorter()

        // First load — gets auth defaults
        fireGameDataReady()

        // User requests a different arrangement
        fireArrangementRequested('by-genre', 'by-playtime')
        mockEmit.mockClear()

        // Layout switch fires another GameDataReady — should NOT reset to defaults
        fireGameDataReady()

        const payload = lastSectionsReadyPayload()
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('first GameDataReady for anonymous user uses defaults: by-genre / by-playtime', () => {
        mockIsAnonymous = true
        mockGames = [makeGame(1, 'Action')]
        new GameSorter()

        fireGameDataReady()

        const payload = lastSectionsReadyPayload()
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('second GameDataReady for anonymous user preserves by-genre / by-playtime (no reset)', () => {
        mockIsAnonymous = true
        mockGames = [makeGame(1, 'Action'), makeGame(2, 'Strategy')]
        new GameSorter()

        fireGameDataReady()
        mockEmit.mockClear()

        // Layout switch: another GameDataReady — arrangement must persist
        fireGameDataReady()

        const payload = lastSectionsReadyPayload()
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('LayoutClearRequest does not reset hasArrangedOnce: next GameDataReady re-applies current modes', () => {
        mockIsAnonymous = false
        mockGames = [makeGame(1, 'Action'), makeGame(2, 'RPG')]
        new GameSorter()

        // First load — auth defaults
        fireGameDataReady()

        // User requests arrangement change
        fireArrangementRequested('by-genre', 'by-playtime')

        // Store clears (layout switch trigger)
        fireLayoutClearRequest()
        mockEmit.mockClear()

        // GameDataReady after clear — should still use by-genre / by-playtime
        fireGameDataReady()

        const payload = lastSectionsReadyPayload()
        expect(payload.groupMode).toBe('by-genre')
        expect(payload.sortMode).toBe('by-playtime')
    })

    it('LayoutClearRequest alone does not emit SectionsReady', () => {
        mockIsAnonymous = false
        mockGames = [makeGame(1)]
        new GameSorter()

        fireGameDataReady()
        mockEmit.mockClear()

        fireLayoutClearRequest()

        const sectionsReadyCalls = mockEmit.mock.calls.filter(
            ([type]) => type === GameEventTypes.SectionsReady
        )
        expect(sectionsReadyCalls.length).toBe(0)
    })
})
