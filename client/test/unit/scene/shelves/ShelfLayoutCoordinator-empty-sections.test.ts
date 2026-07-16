/**
 * Test: Empty sections should not allocate shelves
 *
 * Verifies that ShelfLayoutCoordinator does not create shelves for
 * sections with no games, preventing visible empty shelves in the store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { ShelfLayoutCoordinator } from '../../../../src/scene/shelves/ShelfLayoutCoordinator'
import { GameSorter } from '../../../../src/scene/categorization/GameSorter'
import { DataDomain, DataManager } from '../../../../src/core/data'
import { GameEventTypes, StorePropsEventTypes, UIEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent, ArrangementRequestedEvent } from '../../../../src/types/EnvironmentEvents'
import { GroupModes, SortModes } from '../../../../src/types/LayoutTypes'
import type { SteamGame } from '../../../../src/steam'

describe('ShelfLayoutCoordinator – empty sections', () => {
    let eventManager: EventManager
    let shelfReady: ShelfReadyEvent[]

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        shelfReady = []
        
        // Reset ShelfLayoutCoordinator singleton before each test
        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null

        // Construct fresh coordinator
        ShelfLayoutCoordinator.getInstance('arc')

        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => {
                shelfReady.push(e.detail)
            }
        )
    })

    afterEach(() => {
        eventManager.removeAllListeners()
        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null
    })

    function emitSectionsReady(sections: SectionsReadyEvent['sections']) {
        eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections,
            groupMode: GroupModes.ByGenre,
            sortMode: SortModes.ByPlaytime,
        })
    }

    it('should allocate 0 shelves for a completely empty section', () => {
        emitSectionsReady([
            {
                name: 'Empty Section',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: []
            }
        ])

        // Should emit no ShelfReady events for empty section
        expect(shelfReady).toHaveLength(0)
    })

    it('should skip empty sections among sections with games', () => {
        emitSectionsReady([
            {
                name: 'Games Section',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: [
                    { appid: 1, name: 'Game 1' } as any,
                    { appid: 2, name: 'Game 2' } as any,
                ]
            },
            {
                name: 'Empty Section',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: []
            },
            {
                name: 'More Games',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: [
                    { appid: 3, name: 'Game 3' } as any,
                ]
            }
        ])

        // Verify section indices: should have entries for sections 0 and 2, not 1
        const sectionIndices = new Set(shelfReady.map(s => s.sectionIndex))
        expect(sectionIndices.has(0)).toBe(true)
        expect(sectionIndices.has(1)).toBe(false) // Empty section should NOT have shelves
        expect(sectionIndices.has(2)).toBe(true)
    })

    it('should correctly assign section indices to shelves even with skipped sections', () => {
        emitSectionsReady([
            {
                name: 'Section A',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: Array(5).fill(null).map((_, i) => ({ appid: i + 1, name: `Game ${i + 1}` } as any))
            },
            {
                name: 'Empty',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: []
            },
            {
                name: 'Section B',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: Array(3).fill(null).map((_, i) => ({ appid: i + 100, name: `Game ${i + 100}` } as any))
            }
        ])

        // Verify section indices are preserved
        const section0Shelves = shelfReady.filter(s => s.sectionIndex === 0)
        const section1Shelves = shelfReady.filter(s => s.sectionIndex === 1)
        const section2Shelves = shelfReady.filter(s => s.sectionIndex === 2)

        expect(section0Shelves.length).toBeGreaterThan(0)
        expect(section1Shelves).toHaveLength(0) // Empty section
        expect(section2Shelves.length).toBeGreaterThan(0)
    })
})

describe('ShelfLayoutCoordinator - ArrangementRequested ordering (production bootstrap order)', () => {
    let eventManager: EventManager

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        DataManager.getInstance().clear()

        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null

        // Matches real bootstrap: SceneCoordinator constructs GameSorter first; ShelfLayoutCoordinator
        // is only constructed later, via StorePropsCoordinator's separate activation. EventTarget
        // dispatches to listeners in registration order, so this ordering is what actually matters -
        // constructing ShelfLayoutCoordinator first (as the other describe block above does) would
        // mask the regression this test exists to catch.
        new GameSorter()
        ShelfLayoutCoordinator.getInstance('arc')
    })

    afterEach(() => {
        eventManager.removeAllListeners()
        DataManager.getInstance().clear()
        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null
    })

    it('still has shelves after ArrangementRequested when GameSorter is constructed first', () => {
        const games: SteamGame[] = Array.from({ length: 6 }, (_, i) => ({
            appid: i + 1,
            name: `Game ${i + 1}`,
            playtime_forever: 0,
            img_icon_url: '',
            img_logo_url: '',
            artwork: { icon: '', logo: '', header: '', library: '' },
        }))
        DataManager.getInstance().set('steam.games', games as any, { domain: DataDomain.SteamIntegration })

        const shelfReady: ShelfReadyEvent[] = []
        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => { shelfReady.push(e.detail) }
        )

        eventManager.emit<ArrangementRequestedEvent>(UIEventTypes.ArrangementRequested, {
            groupMode: GroupModes.None,
            sortMode: SortModes.ByPlaytime,
        })

        expect(shelfReady.length).toBeGreaterThan(0)
        expect((ShelfLayoutCoordinator.getInstance() as any).totalShelves).toBeGreaterThan(0)
    })
})

