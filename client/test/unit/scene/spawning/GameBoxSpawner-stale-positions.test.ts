/**
 * Unit Tests: GameBoxSpawner â€” Stale Shelf Position Clearing
 *
 * Verifies that shelfPositions and placementIntents are fully cleared at the
 * start of every SectionsReady cycle so games never land on phantom shelves
 * from a previous group/sort run.
 *
 * Event order per cycle (mirrors production flow driven by ShelfLayoutCoordinator):
 *   1. SectionsReady   â†’ clears stale positions, caches sections
 *   2. ShelfReady x N  â†’ populates fresh positions for this cycle
 *   3. ShelfLayoutDetermined â†’ triggers placement with fresh positions
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { GameBoxSpawner } from '../../../../src/scene/spawning/GameBoxSpawner'

import {
    GameRenderEventTypes,
    StorePropsEventTypes,
    GameEventTypes,
    SteamEventTypes,
    type ArtworkIntentSettledEvent,
    type BatchReadyForPlacementEvent,
    type PlacementIntentReadyEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
} from '../../../../src/types/InteractionEvents'
import type { SectionsReadyForPlacementEvent } from '../../../../src/types/EnvironmentEvents'
import type { SteamLibraryManifestReadyEvent } from '../../../../src/types/InteractionEvents'
import type { SteamGame } from '../../../../src/steam'

// â”€â”€ GPU mock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockPrefetchArtwork = vi.fn().mockResolvedValue('prefetched')
const mockPlaceGame = vi.fn()
const mockClearPlacements = vi.fn()
const mockRendererDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/GpuGameBoxRenderer', async () => {
    const { ArtworkPrefetchCoordinator } = await import('../../../../src/scene/spawning/ArtworkPrefetchCoordinator')
    return {
        GpuGameBoxRenderer: vi.fn().mockImplementation(function () {
            this.prefetchArtwork = mockPrefetchArtwork
            this.placeGame = mockPlaceGame
            this.clearPlacements = mockClearPlacements
            this.addToScene = vi.fn()
            this.updateLODForCamera = vi.fn()
            const coordinator = new ArtworkPrefetchCoordinator({ renderer: this })
            this.dispose = vi.fn(() => {
                mockRendererDispose()
                coordinator.dispose()
            })
        }),
    }
})

vi.mock('../../../../src/core/AppSettings', () => {
    const Setting = { EnableLabels: 'enableLabels' }
    const AppSettings = {
        get: vi.fn((key: string) => (key === Setting.EnableLabels ? true : undefined)),
    }
    return { AppSettings, Setting }
})

vi.mock('../../../../src/core/EventManager', async (importOriginal) => {
    const actual = await importOriginal() as any
    type MockInstance = { registerEventHandler: Mock; emit: Mock; deregisterEventHandler: Mock }
    let mockInstance: MockInstance | null = null

    return {
        ...actual,
        EventManager: Object.assign(
            vi.fn(() => ({ registerEventHandler: vi.fn(), emit: vi.fn(), deregisterEventHandler: vi.fn() })),
            {
                getInstance: vi.fn(() =>
                    (mockInstance ??= {
                        registerEventHandler: vi.fn(),
                        emit: vi.fn(),
                        deregisterEventHandler: vi.fn(),
                    })
                ),
                resetInstance: () => {
                    mockInstance = null
                },
            }
        ),
    }
})

const resetEventManager = () =>
    (EventManager as unknown as { resetInstance: () => void }).resetInstance()

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function wireHandlers(eventManager: EventManager): Map<string, Set<Function>> {
    const handlers = new Map<string, Set<Function>>()

    vi.mocked(eventManager.registerEventHandler).mockImplementation(
        (eventType: string, handler: Function) => {
            if (!handlers.has(eventType)) handlers.set(eventType, new Set())
            handlers.get(eventType)!.add(handler)
        }
    )

    vi.mocked(eventManager.emit).mockImplementation((eventType: string, detail: any) => {
        const set = handlers.get(eventType)
        if (set) {
            const event = new CustomEvent(eventType, { detail })
            set.forEach((h) => h(event))
        }
        return true
    })

    return handlers
}

function wireRenderIntentRendezvous(eventManager: EventManager): void {
    const settledAppIds = new Set<number>()
    const pending = new Map<number, PlacementIntentReadyEvent[]>()

    const flush = (appid: number) => {
        if (!settledAppIds.has(appid)) return

        const intents = pending.get(appid)
        if (!intents || intents.length === 0) return

        while (intents.length > 0) {
            const intent = intents.shift()
            if (!intent) break
            mockPlaceGame(intent.game, intent.position, intent.rotation)
        }

        pending.delete(appid)
    }

    eventManager.registerEventHandler(
        GameRenderEventTypes.ArtworkIntentSettled,
        (event: CustomEvent<ArtworkIntentSettledEvent>) => {
            settledAppIds.add(event.detail.appid)
            flush(event.detail.appid)
        }
    )

    eventManager.registerEventHandler(
        GameRenderEventTypes.PlacementIntentReady,
        (event: CustomEvent<PlacementIntentReadyEvent>) => {
            const intents = pending.get(event.detail.appid) ?? []
            intents.push(event.detail)
            pending.set(event.detail.appid, intents)
            flush(event.detail.appid)
        }
    )
}

/**
 * Games with unique appids and artwork URLs, pre-warmed via BatchReadyForPlacement.
 */
function makeGames(count: number, offset = 0): SteamGame[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: offset * 100 + i + 1,
        name: `Game ${offset * 100 + i + 1}`,
        playtime_forever: 60,
        img_icon_url: '',
        img_logo_url: '',
        artwork: {
            library: `https://example.com/${offset * 100 + i + 1}.jpg`,
            icon: '',
            logo: '',
            header: '',
        },
    }))
}

function makeSectionsReadyEvent(games: SteamGame[], sectionName = 'All'): SectionsReadyForPlacementEvent {
    return {
        sections: [{
            sectionId: `test-${sectionName.toLowerCase()}-0`,
            sectionIndex: 0,
            section: { name: sectionName, games: games as any, groupMode: 'by-recency', sortMode: 'by-last-played' },
        }],
        groupMode: 'by-recency',
        sortMode: 'by-last-played',
    }
}

function emitShelfReady(
    eventManager: EventManager,
    shelfIndex: number,
    sectionIndex: number,
    position = new THREE.Vector3(shelfIndex * 2, 0, 0)
): void {
    eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        shelfIndex,
        sectionIndex,
        position,
        rotationY: 0,
    })
}

function emitShelfLayoutDetermined(eventManager: EventManager): void {
    const mockStrategy = { order: (boards: any[]) => boards.flatMap((b) => [b.near, b.far]) }
    eventManager.emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
        shelfBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
        shelfLayout: { rows: 1 },
        stockStrategy: mockStrategy as any,
    })
}

/**
 * Run one full placement cycle:
 *   BatchReadyForPlacement (prewarm) â†’ await microtask
 *   â†’ SectionsReady â†’ ShelfReady(s) â†’ ShelfLayoutDetermined
 */
async function runCycle(
    eventManager: EventManager,
    shelfCount: number,
    games: SteamGame[],
    sectionName = 'All'
): Promise<void> {
    // Prewarm: gives spawner the games so prefetchResults is populated
    eventManager.emit<BatchReadyForPlacementEvent>(
        StorePropsEventTypes.BatchReadyForPlacement,
        { games, batchIndex: 0, totalBatches: 1 }
    )
    await Promise.resolve() // let prefetchArtwork microtasks settle

    // SectionsReady: clears stale positions, caches sections
    eventManager.emit<SectionsReadyForPlacementEvent>(
        GameEventTypes.SectionsReadyForPlacement,
        makeSectionsReadyEvent(games, sectionName)
    )

    // ShelfReady: populate fresh positions for this cycle
    for (let i = 0; i < shelfCount; i++) {
        emitShelfReady(eventManager, i, 0)
    }

    // ShelfLayoutDetermined: triggers placement with fresh positions
    emitShelfLayoutDetermined(eventManager)
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('GameBoxSpawner â€” stale shelf positions', () => {
    let eventManager: EventManager
    let spawner: GameBoxSpawner // keep reference to prevent GC

    beforeEach(() => {
        const mockScene = new THREE.Scene()
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })

        resetEventManager()
        eventManager = EventManager.getInstance()
        wireHandlers(eventManager)
        wireRenderIntentRendezvous(eventManager)

        // Construct spawner â€” registers all event handlers
        spawner = new (GameBoxSpawner as any)()

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: 100,
        })

        // Prime stock strategy so spawner is ready for the first cycle
        emitShelfLayoutDetermined(eventManager)
    })

    afterEach(() => {
        vi.clearAllMocks()
        mockPrefetchArtwork.mockResolvedValue('prefetched')
        mockPlaceGame.mockReset()
        mockClearPlacements.mockReset()
    })

    it('second cycle: shelf positions from the first run do not influence placement', async () => {
        const gamesA = makeGames(3, 0)
        const gamesB = makeGames(3, 1)

        // Cycle 1: 3 shelves
        await runCycle(eventManager, 3, gamesA)
        const placementsAfterCycle1 = mockPlaceGame.mock.calls.length
        mockPlaceGame.mockClear()

        // Cycle 2: only 1 shelf â€” if stale positions survived, games would land on shelves 1 & 2
        await runCycle(eventManager, 1, gamesB)

        // All cycle-2 placements should reference the single new shelf position
        const cycle2Calls = mockPlaceGame.mock.calls
        expect(cycle2Calls.length).toBe(gamesB.length)

        // All cycle-2 placements should be near shelf 0 (x≈0), not near cycle-1's shelves (x≈2, 4)
        // Games land with local shelf offsets, so we verify they're not near x=2 or beyond.
        cycle2Calls.forEach((args) => {
            const position: THREE.Vector3 = args[1] // placeGame(game, position, rotation)
            expect(Math.abs(position.x)).toBeLessThan(1.5) // shelf 0 is at x=0; shelf 1 was at x=2
        })

        // Sanity: cycle 1 did use multiple shelf positions
        expect(placementsAfterCycle1).toBe(gamesA.length)
    })

    it('second cycle only has access to shelves emitted in the second ShelfReady wave', async () => {
        const gamesA = makeGames(4, 0)
        const gamesB = makeGames(4, 2)

        // Cycle 1: 4 shelves (shelfIndex 0â€“3)
        await runCycle(eventManager, 4, gamesA)
        mockPlaceGame.mockClear()

        // Cycle 2: only 2 shelves (shelfIndex 0â€“1)
        await runCycle(eventManager, 2, gamesB)

        // Collect the unique x-positions used in cycle 2
        const usedXPositions = new Set(
            mockPlaceGame.mock.calls.map((args) => Math.round((args[1] as THREE.Vector3).x))
        )

        // Only x=0 (shelf 0) and x=2 (shelf 1) should appear â€” not x=4 or x=6 from cycle 1
        expect(usedXPositions.has(4)).toBe(false) // shelf 2 from cycle 1
        expect(usedXPositions.has(6)).toBe(false) // shelf 3 from cycle 1
    })

    it('no ghost sectionIndex entries survive between cycles', async () => {
        const gamesSection0 = makeGames(2, 0)
        const gamesSection1 = makeGames(2, 1)
        const gamesCycle2 = makeGames(2, 2)

        // Prewarm all games before cycle 1
        eventManager.emit<BatchReadyForPlacementEvent>(
            StorePropsEventTypes.BatchReadyForPlacement,
            { games: [...gamesSection0, ...gamesSection1], batchIndex: 0, totalBatches: 1 }
        )
        await Promise.resolve()

        // Cycle 1: two sections, one shelf each
        eventManager.emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            sections: [
                {
                    sectionId: 'test-section-a-0',
                    sectionIndex: 0,
                    section: { name: 'Section A', games: gamesSection0 as any, groupMode: 'by-recency', sortMode: 'by-last-played' },
                },
                {
                    sectionId: 'test-section-b-1',
                    sectionIndex: 1,
                    section: { name: 'Section B', games: gamesSection1 as any, groupMode: 'by-recency', sortMode: 'by-last-played' },
                },
            ],
            groupMode: 'by-recency',
            sortMode: 'by-last-played',
        })
        emitShelfReady(eventManager, 0, 0) // shelf 0 â†’ section 0
        emitShelfReady(eventManager, 1, 1) // shelf 1 â†’ section 1
        emitShelfLayoutDetermined(eventManager)
        mockPlaceGame.mockClear()

        // Prewarm cycle 2 games
        eventManager.emit<BatchReadyForPlacementEvent>(
            StorePropsEventTypes.BatchReadyForPlacement,
            { games: gamesCycle2, batchIndex: 0, totalBatches: 1 }
        )
        await Promise.resolve()

        // Cycle 2: single section, single shelf â€” section 1 from cycle 1 must not persist
        eventManager.emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            sections: [
                {
                    sectionId: 'test-only-section-0',
                    sectionIndex: 0,
                    section: { name: 'Only Section', games: gamesCycle2 as any, groupMode: 'by-recency', sortMode: 'by-last-played' },
                },
            ],
            groupMode: 'by-recency',
            sortMode: 'by-last-played',
        })
        emitShelfReady(eventManager, 0, 0) // only shelf 0 â†’ section 0
        emitShelfLayoutDetermined(eventManager)

        // All cycle-2 games should be placed (no ghost section 1 stealing any slot)
        expect(mockPlaceGame).toHaveBeenCalledTimes(2)

        // No game should have been placed at shelf 1's old position (x=2)
        const usedXPositions = new Set(
            mockPlaceGame.mock.calls.map((args) => Math.round((args[1] as THREE.Vector3).x))
        )
        expect(usedXPositions.has(2)).toBe(false)
    })
})

