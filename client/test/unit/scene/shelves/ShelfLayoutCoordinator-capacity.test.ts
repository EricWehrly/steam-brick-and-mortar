/**
 * Test: shelf count derives from the active layout's actual stocking capacity.
 *
 * Regression coverage for a pre-existing bug: shelf allocation assumed a flat
 * GAMES_PER_SURFACE * SURFACES_PER_SHELF (18) slots per shelf regardless of layout,
 * but RowStockStrategy/SpokeStockStrategy only fill near faces (9 slots), so Row
 * allocated half the shelves it needed and silently dropped half the library.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventManager } from '../../../../src/core/EventManager'
import { ShelfLayoutCoordinator } from '../../../../src/scene/shelves/ShelfLayoutCoordinator'
import { GameEventTypes, StorePropsEventTypes, type ShelfReadyEvent } from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../../../src/types/EnvironmentEvents'
import { GroupModes, SortModes } from '../../../../src/types/LayoutTypes'

const ROW_SLOTS_PER_SHELF = 9
const ARC_SLOTS_PER_SHELF = 18

describe('ShelfLayoutCoordinator - capacity-derived shelf allocation', () => {
    let eventManager: EventManager
    let shelfReady: ShelfReadyEvent[]

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        shelfReady = []

        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null

        eventManager.registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (e: CustomEvent<ShelfReadyEvent>) => shelfReady.push(e.detail)
        )
    })

    afterEach(() => {
        eventManager.removeAllListeners()
        const anyCoord = ShelfLayoutCoordinator as any
        anyCoord.instance = null
    })

    function emitSectionsReady(gameCount: number) {
        eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections: [{
                name: 'Section',
                groupMode: GroupModes.ByGenre,
                sortMode: SortModes.ByPlaytime,
                games: Array.from({ length: gameCount }, (_, i) => ({ appid: i + 1, name: `Game ${i + 1}` } as any)),
            }],
            groupMode: GroupModes.ByGenre,
            sortMode: SortModes.ByPlaytime,
        })
    }

    it('Row allocates ceil(N/9) shelves', () => {
        ShelfLayoutCoordinator.getInstance('row')
        emitSectionsReady(20)

        const shelfIndices = new Set(shelfReady.map(s => s.shelfIndex))
        expect(shelfIndices.size).toBe(Math.ceil(20 / ROW_SLOTS_PER_SHELF))
    })

    it('Arc allocates ceil(N/18) shelves', () => {
        ShelfLayoutCoordinator.getInstance('arc')
        emitSectionsReady(20)

        const shelfIndices = new Set(shelfReady.map(s => s.shelfIndex))
        expect(shelfIndices.size).toBe(Math.ceil(20 / ARC_SLOTS_PER_SHELF))
    })

    it('Row allocates enough shelves to seat every game (no silent drops)', () => {
        ShelfLayoutCoordinator.getInstance('row')
        const gameCount = 45
        emitSectionsReady(gameCount)

        const shelfIndices = new Set(shelfReady.map(s => s.shelfIndex))
        expect(shelfIndices.size * ROW_SLOTS_PER_SHELF).toBeGreaterThanOrEqual(gameCount)
    })
})
