import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GameEventTypes, SteamEventTypes } from '../../../src/types/InteractionEvents'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

const mockHandlers = new Map<string, Array<(e: CustomEvent) => void>>()
const mockEmit = vi.fn()

vi.mock('../../../src/core/EventManager', () => ({
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
vi.mock('../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: () => ({
            get: () => mockGames,
        }),
    },
}))

import { LayoutControlPanel } from '../../../src/ui/LayoutControlPanel'

function game(partial: Partial<SteamGameData>): SteamGameData {
    return {
        appid: partial.appid ?? 0,
        name: partial.name ?? 'Test',
        playtime_forever: partial.playtime_forever ?? 0,
        ...partial,
    }
}

function fire(eventType: string, detail: unknown = {}): void {
    const handlers = mockHandlers.get(eventType) ?? []
    const event = new CustomEvent(eventType, { detail })
    for (const handler of handlers) handler(event)
}

function optionValues(select: HTMLSelectElement | null): string[] {
    return Array.from(select?.options ?? []).map(option => option.value)
}

describe('LayoutControlPanel', () => {
    beforeEach(() => {
        mockHandlers.clear()
        mockEmit.mockReset()
        mockGames = []
        document.body.innerHTML = ''
    })

    it('only offers baseline group/sort options when no games have taxonomy data yet', () => {
        mockGames = [game({ appid: 1 })]
        const panel = new LayoutControlPanel()
        panel.init()

        const groupSelect = document.querySelector('.layout-sort-control-group select[title="Group mode"]') as HTMLSelectElement
        const sortSelect = document.querySelector('.layout-sort-control-group select[title="Sort order"]') as HTMLSelectElement

        expect(optionValues(groupSelect)).toEqual(expect.arrayContaining(['by-playtime', 'none']))
        expect(optionValues(groupSelect)).not.toContain('by-recency')
        expect(optionValues(groupSelect)).not.toContain('by-user-collection')
        expect(optionValues(sortSelect)).toEqual(expect.arrayContaining(['alphabetical', 'by-playtime']))
        expect(optionValues(sortSelect)).not.toContain('by-last-played')
    })

    it('expands group/sort options after GameDataReady reveals recency data', () => {
        mockGames = [game({ appid: 1 })]
        const panel = new LayoutControlPanel()
        panel.init()

        mockGames = [game({ appid: 1, rtime_last_played: 12345 })]
        fire(GameEventTypes.GameDataReady)

        const groupSelect = document.querySelector('.layout-sort-control-group select[title="Group mode"]') as HTMLSelectElement
        const sortSelect = document.querySelector('.layout-sort-control-group select[title="Sort order"]') as HTMLSelectElement
        expect(optionValues(groupSelect)).toContain('by-recency')
        expect(optionValues(sortSelect)).toContain('by-last-played')
    })

    it('expands to offer By Collection after TaxonomyDataReady reveals user_collections', () => {
        mockGames = [game({ appid: 1 })]
        const panel = new LayoutControlPanel()
        panel.init()

        mockGames = [game({ appid: 1, user_collections: ['Ze Done'] })]
        fire(SteamEventTypes.TaxonomyDataReady, { origin: 'local-scan' })

        const groupSelect = document.querySelector('.layout-sort-control-group select[title="Group mode"]') as HTMLSelectElement
        expect(optionValues(groupSelect)).toContain('by-user-collection')
    })

    it('preserves the active selection across a refresh when it is still offered', () => {
        mockGames = [game({ appid: 1, genres: [{ id: '1', description: 'Action' }] })]
        const panel = new LayoutControlPanel()
        panel.init()

        fire(GameEventTypes.SectionsReady, { groupMode: 'by-genre', sortMode: 'alphabetical', sections: [] })

        const groupSelect = document.querySelector('.layout-sort-control-group select[title="Group mode"]') as HTMLSelectElement
        expect(groupSelect.value).toBe('by-genre')

        fire(GameEventTypes.GameDataReady)

        expect(groupSelect.value).toBe('by-genre')
    })
})
