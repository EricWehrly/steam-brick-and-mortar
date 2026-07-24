import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { GameEventTypes, UIEventTypes } from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent, SectionsReadyForPlacementEvent, LayoutRequestedEvent } from '../../../../src/types/EnvironmentEvents'
import type { Section } from '../../../../src/types/LayoutTypes'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'
import { LiminalWindowCoordinator } from '../../../../src/scene/liminal/LiminalWindowCoordinator'
import type { MockFn } from '../../../utils/test-types'
import { LIMINAL_DEPTH_SLOTS } from '../../../../src/scene/liminal/LiminalCorridorLayout'
import { computeSlotsPerShelf } from '../../../../src/scene/props/shared/StockStrategy'
import { RowStockStrategy } from '../../../../src/scene/props/shared/RowLayoutUtils'
import { DEFAULT_SHELF_CONFIG } from '../../../../src/scene/props/shared/SharedPropsTypes'

const SLOTS_PER_UNIT = computeSlotsPerShelf(new RowStockStrategy(), DEFAULT_SHELF_CONFIG.shelfCount)
const EXPECTED_WINDOW_SIZE = LIMINAL_DEPTH_SLOTS * 2 * SLOTS_PER_UNIT

function makeGames(count: number): SteamGameData[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: i + 1,
        name: `Game ${i + 1}`,
        playtime_forever: 0,
        rtime_last_played: 0,
        img_icon_url: '',
        img_logo_url: '',
    } as SteamGameData))
}

function makeSections(gameCount: number, sectionCount: number): Section[] {
    const games = makeGames(gameCount)
    const perSection = Math.ceil(gameCount / sectionCount)
    return Array.from({ length: sectionCount }, (_, i) => ({
        name: `Section ${i}`,
        games: games.slice(i * perSection, (i + 1) * perSection),
        groupMode: 'by-genre' as const,
        sortMode: 'by-playtime' as const,
    }))
}

function emitLayoutRequested(layoutMode: string): void {
    EventManager.getInstance().emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, { layoutMode: layoutMode as any })
}

function emitSectionsReady(sections: Section[]): void {
    EventManager.getInstance().emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
        sections,
        groupMode: 'by-genre',
        sortMode: 'by-playtime',
    })
}

function emitSectionsReadyForPlacement(sections: Section[]): void {
    EventManager.getInstance().emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
        groupMode: 'by-genre',
        sortMode: 'by-playtime',
        sections: sections.map((section, sectionIndex) => ({
            sectionId: `s${sectionIndex}`,
            sectionIndex,
            section,
        })),
    })
}

describe('LiminalWindowCoordinator', () => {
    let sectionsReadySpy: MockFn<[SectionsReadyEvent], void>
    let sectionsReadyForPlacementSpy: MockFn<[SectionsReadyForPlacementEvent], void>

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()

        // Construct the coordinator first, then register spies — matches production
        // registration order (this class is constructed before ShelfLayoutCoordinator/
        // GameBoxSpawner during bootstrap), which is what makes interception work.
        new LiminalWindowCoordinator()

        sectionsReadySpy = vi.fn()
        sectionsReadyForPlacementSpy = vi.fn()
        EventManager.getInstance().registerEventHandler<SectionsReadyEvent>(
            GameEventTypes.SectionsReady,
            (e) => sectionsReadySpy(e.detail)
        )
        EventManager.getInstance().registerEventHandler<SectionsReadyForPlacementEvent>(
            GameEventTypes.SectionsReadyForPlacement,
            (e) => sectionsReadyForPlacementSpy(e.detail)
        )
    })

    it('passes SectionsReady through unmodified when liminal is not active', () => {
        emitLayoutRequested('row')
        const sections = makeSections(50, 3)
        emitSectionsReady(sections)

        expect(sectionsReadySpy).toHaveBeenCalledTimes(1)
        expect(sectionsReadySpy.mock.calls[0][0].sections).toBe(sections)
    })

    it('replaces SectionsReady with a single windowed section when liminal is active', () => {
        emitLayoutRequested('liminal')
        emitSectionsReady(makeSections(500, 10))

        expect(sectionsReadySpy).toHaveBeenCalledTimes(1)
        const detail: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        expect(detail.sections).toHaveLength(1)
        expect(detail.sections[0].games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('replaces SectionsReadyForPlacement with a single windowed section when liminal is active', () => {
        emitLayoutRequested('liminal')
        emitSectionsReadyForPlacement(makeSections(500, 10))

        expect(sectionsReadyForPlacementSpy).toHaveBeenCalledTimes(1)
        const detail: SectionsReadyForPlacementEvent = sectionsReadyForPlacementSpy.mock.calls[0][0]
        expect(detail.sections).toHaveLength(1)
        expect(detail.sections[0].section.games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('produces exactly the window size regardless of library size, including libraries smaller than the window', () => {
        emitLayoutRequested('liminal')
        emitSectionsReady(makeSections(5, 1))

        const detail: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        expect(detail.sections[0].games).toHaveLength(EXPECTED_WINDOW_SIZE)
    })

    it('reseeds the window from a fresh sequence on the next SectionsReady (resort/filter change)', () => {
        emitLayoutRequested('liminal')
        emitSectionsReady(makeSections(500, 10))
        const first: SectionsReadyEvent = sectionsReadySpy.mock.calls[0][0]
        // Library >= window size: no wraparound, every game in the window is unique.
        expect(new Set(first.sections[0].games.map(g => g.appid)).size).toBe(EXPECTED_WINDOW_SIZE)

        emitSectionsReady(makeSections(30, 2))
        const second: SectionsReadyEvent = sectionsReadySpy.mock.calls[1][0]
        const appids = second.sections[0].games.map(g => g.appid)
        expect(appids).toHaveLength(EXPECTED_WINDOW_SIZE)
        // Smaller library than the window: the ring wraps, so the sequence repeats every 30 games.
        expect(appids[30]).toBe(appids[0])
        expect(new Set(appids).size).toBe(30)
    })

    it('stops reacting to SectionsReady once layout switches away from liminal', () => {
        emitLayoutRequested('liminal')
        emitSectionsReady(makeSections(500, 10))
        expect(sectionsReadySpy.mock.calls[0][0].sections).toHaveLength(1)

        emitLayoutRequested('arc')
        const sections = makeSections(50, 3)
        emitSectionsReady(sections)

        expect(sectionsReadySpy).toHaveBeenCalledTimes(2)
        expect(sectionsReadySpy.mock.calls[1][0].sections).toBe(sections)
    })
})
