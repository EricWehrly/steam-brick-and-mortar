/**
 * Test: Empty sections should not allocate shelves
 *
 * Verifies that ShelfLayoutCoordinator does not create shelves for
 * sections with no games, preventing visible empty shelves in the store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { ShelfLayoutCoordinator } from '../../../../src/scene/shelves/ShelfLayoutCoordinator'
import { GameEventTypes, StorePropsEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../../../src/types/EnvironmentEvents'

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
        eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections })
    }

    it('should allocate 0 shelves for a completely empty section', () => {
        emitSectionsReady([
            {
                name: 'Empty Section',
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
                games: [
                    { appid: 1, name: 'Game 1' } as any,
                    { appid: 2, name: 'Game 2' } as any,
                ]
            },
            {
                name: 'Empty Section',
                games: []
            },
            {
                name: 'More Games',
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
                games: Array(5).fill(null).map((_, i) => ({ appid: i + 1, name: `Game ${i + 1}` } as any))
            },
            {
                name: 'Empty',
                games: []
            },
            {
                name: 'Section B',
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

