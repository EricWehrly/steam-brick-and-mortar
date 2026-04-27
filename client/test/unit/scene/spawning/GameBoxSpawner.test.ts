/**
 * Unit Tests: GameBoxSpawner — Two-Phase Load/Place
 *
 * Tests verify the refactored GameBoxSpawner correctly:
 * 1. Phase 1 (BatchReadyForPlacement): calls renderer.prefetchArtwork() for each game with a URL
 * 2. ShelfReady: caches shelf positions for later use by GamesSort
 * 3. Phase 2 (GamesSort): calls clearPlacements() + placeArtworkInstance()/placeLabelBox() in sorted order
 * 4. Emits GamesPlaced events on GamesSort
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { GameBoxSpawner } from '../../../../src/scene/spawning/GameBoxSpawner'

import {
    StorePropsEventTypes,
    SteamEventTypes,
    GameEventTypes,
    UIEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type GamesPlacedEvent,
} from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../../../src/types/EnvironmentEvents'
import type { SteamLibraryManifestReadyEvent } from '../../../../src/types/InteractionEvents'
import type {
    StorePropsLibraryReloadRequestEvent,
} from '../../../../src/scene/props/PropsEvents'
import type { SteamGame } from '../../../../src/steam'

// Mock GpuGameBoxRenderer so the spawner never touches real GPU code
const mockPrefetchArtwork = vi.fn().mockResolvedValue('prefetched')
const mockPlaceGame = vi.fn()
const mockClearPlacements = vi.fn()
const mockRendererDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/GpuGameBoxRenderer', () => ({
    GpuGameBoxRenderer: vi.fn().mockImplementation(function() {
        this.prefetchArtwork = mockPrefetchArtwork
        this.placeGame = mockPlaceGame
        this.clearPlacements = mockClearPlacements
        this.dispose = mockRendererDispose
        this.addToScene = vi.fn()
        this.updateLODForCamera = vi.fn()
    })
}))

// Mock AppSettings so GameBoxSpawner can read EnableLabels at construction
vi.mock('../../../../src/core/AppSettings', () => {
    const Setting = {
        EnableLabels: 'enableLabels',
    }
    const AppSettings = {
        get: vi.fn((key: string) => {
            if (key === Setting.EnableLabels) return true
            return undefined
        })
    }
    return { AppSettings, Setting }
})

// Mock EventManager with test helper
vi.mock('../../../../src/core/EventManager', async (importOriginal) => {
    const actual = await importOriginal() as any
    type MockInstance = { registerEventHandler: Mock; emit: Mock; deregisterEventHandler: Mock }
    let mockInstance: MockInstance | null = null

    return {
        ...actual,
        EventManager: Object.assign(
            vi.fn(() => ({ registerEventHandler: vi.fn(), emit: vi.fn(), deregisterEventHandler: vi.fn() })),
            {
                getInstance: vi.fn(() => mockInstance ??= {
                    registerEventHandler: vi.fn(),
                    emit: vi.fn(),
                    deregisterEventHandler: vi.fn()
                }),
                resetInstance: () => { mockInstance = null }
            }
        )
    }
})

const resetEventManager = () => (EventManager as unknown as { resetInstance: () => void }).resetInstance()

function makeShelfReady(shelfIndex: number, position = new THREE.Vector3(0, 0, 0), rotationY = 0): ShelfReadyEvent {
    return { shelfIndex, sectionIndex: 0, position, rotationY }
}

function createMockGames(count: number, batchIndex: number): readonly SteamGame[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: batchIndex * 100 + i,
        name: `Batch ${batchIndex} Game ${i}`,
        playtime_forever: 120,
        img_icon_url: '',
        img_logo_url: '',
        artwork: undefined  // No artwork URL → will be routed to label path
    }))
}

function createMockGamesWithArtwork(count: number, batchIndex: number): readonly SteamGame[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: batchIndex * 100 + i,
        name: `Batch ${batchIndex} Game ${i}`,
        playtime_forever: 120,
        img_icon_url: '',
        img_logo_url: '',
        artwork: { library: `https://example.com/${batchIndex * 100 + i}.jpg`, icon: '', logo: '', header: '' }
    }))
}

function emitShelfLayoutDetermined(em: EventManager) {
    // Minimal passthrough strategy — tests don't assert strategy-specific ordering
    const mockStrategy = { order: (boards: any[]) => boards.flatMap(b => [b.near, b.far]) }
    em.emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
        shelfBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
        shelfLayout: { rows: 1 },
        stockStrategy: mockStrategy as any,
    })
}

describe('GameBoxSpawner — Two-Phase Load/Place', () => {
    let eventManager: EventManager
    let spawner: GameBoxSpawner
    let eventHandlers: Map<string, Set<Function>>

    beforeEach(() => {
        const mockScene = new THREE.Scene()
        DataManager.getInstance().set(DataKey.MainScene, mockScene, { domain: DataDomain.Scene })

        resetEventManager()
        
        eventManager = EventManager.getInstance()

        eventHandlers = new Map()

        vi.mocked(eventManager.registerEventHandler).mockImplementation((eventType: string, handler: Function) => {
            if (!eventHandlers.has(eventType)) eventHandlers.set(eventType, new Set())
            eventHandlers.get(eventType)!.add(handler)
        })

        vi.mocked(eventManager.emit).mockImplementation((eventType: string, detail: any) => {
            const handlers = eventHandlers.get(eventType)
            if (handlers) {
                const event = new CustomEvent(eventType, { detail })
                handlers.forEach(handler => handler(event))
            }
            return true
        })

        spawner = new (GameBoxSpawner as any)()
        // Ordering contract: renderer is initialized from immutable manifest before any batch prewarm events.
        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: 500,
            totalBatches: 28,
            appids: Array.from({ length: 500 }, (_, index) => index + 1),
        })
        emitShelfLayoutDetermined(eventManager)
    })

    afterEach(() => {
        vi.clearAllMocks()
        mockPrefetchArtwork.mockResolvedValue('prefetched')
        mockPlaceGame.mockReset()
    })

    // -------------------------------------------------------------------------
    // Phase 1: Prewarm

    describe('Phase 1 — BatchReadyForPlacement → prefetchArtwork()', () => {
        it('calls prefetchArtwork for each game that has an artwork URL', async () => {
            const games = createMockGamesWithArtwork(5, 0)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            await Promise.resolve()
            expect(mockPrefetchArtwork).toHaveBeenCalledTimes(5)
        })

        it('handles empty batches without errors', async () => {
            expect(() => {
                eventManager.emit<BatchReadyForPlacementEvent>(
                    StorePropsEventTypes.BatchReadyForPlacement,
                    { games: [], batchIndex: 0, totalBatches: 1 }
                )
            }).not.toThrow()

            await Promise.resolve()
            expect(mockPrefetchArtwork).not.toHaveBeenCalled()
        })

        it('prewarns multiple batches independently', async () => {
            const batch0 = createMockGamesWithArtwork(5, 0)
            const batch1 = createMockGamesWithArtwork(3, 1)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch0, batchIndex: 0, totalBatches: 2 }
            )
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: batch1, batchIndex: 1, totalBatches: 2 }
            )

            await Promise.resolve()
            expect(mockPrefetchArtwork).toHaveBeenCalledTimes(8)
        })

        it('does not call placeGame during prewarm phase (no position assigned yet)', async () => {
            const games = createMockGamesWithArtwork(10, 0)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            await Promise.resolve()
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })
    })

    // -------------------------------------------------------------------------
    // ShelfReady: position caching

    describe('ShelfReady — caches shelf positions', () => {
        it('caches position without immediately placing games', () => {
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(3, 0, 0))
            )

            expect(mockPlaceGame).not.toHaveBeenCalled()
            expect(mockClearPlacements).not.toHaveBeenCalled()
        })
    })

    // -------------------------------------------------------------------------
    // Phase 2: GamesSort → place

    describe('Phase 2 — GamesSort → placeArtworkInstance() or placeLabelBox()', () => {
        it('calls clearPlacements then places each sorted game', async () => {
            const games = createMockGamesWithArtwork(6, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve() // let prefetch microtasks settle
            // Correct order mirrors ShelfLayoutCoordinator: SectionsReady caches sections,
            // then ShelfReady populates fresh positions, then ShelfLayoutDetermined triggers placement.
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(0, 0, 0))
            )
            emitShelfLayoutDetermined(eventManager)

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).toHaveBeenCalledTimes(6)
        })

        it('skips prefetchArtwork for games with no appid and no artwork metadata', async () => {
            // Only games with no appid AND no artwork metadata get no URL at all.
            const games = [{ appid: 0, name: 'No ID Game', playtime_forever: 0, img_icon_url: '', img_logo_url: '', artwork: undefined }]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )

            await Promise.resolve()
            // appid=0 is falsy so no CDN URL is constructed — prefetchArtwork not called.
            expect(mockPrefetchArtwork).not.toHaveBeenCalled()
        })

        it('emits GamesPlaced per shelf on GamesSort', () => {
            const games = createMockGamesWithArtwork(6, 0) as any[]
            const gamesPlacedEvents: GamesPlacedEvent[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.GamesPlaced,
                (event: CustomEvent<GamesPlacedEvent>) => gamesPlacedEvents.push(event.detail)
            )

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            emitShelfLayoutDetermined(eventManager)

            expect(gamesPlacedEvents.length).toBeGreaterThan(0)
            expect(gamesPlacedEvents[0].status).toBe('games-placed')
        })

        it('distributes sorted games across multiple cached shelves', async () => {
            const games = createMockGamesWithArtwork(20, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 2 }
            )
            await Promise.resolve() // let prefetch microtasks settle
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0, new THREE.Vector3(0, 0, 0)))
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(1, new THREE.Vector3(3, 0, 0)))
            emitShelfLayoutDetermined(eventManager)

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).toHaveBeenCalledTimes(20)
        })

        it('re-sort triggers a fresh clearPlacements call each time', () => {
            const games = createMockGamesWithArtwork(4, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            emitShelfLayoutDetermined(eventManager)
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games: [...games].reverse() as any, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            emitShelfLayoutDetermined(eventManager)

            expect(mockClearPlacements).toHaveBeenCalledTimes(2)
        })

        it('handles empty sorted list gracefully', () => {
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: createMockGamesWithArtwork(1, 0), batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games: [], groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            expect(() => {
                emitShelfLayoutDetermined(eventManager)
            }).not.toThrow()

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })

        it('does not place games if no shelf positions are cached', () => {
            const games = createMockGamesWithArtwork(5, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            // No ShelfLayoutDetermined — placement should not fire without positions
            expect(mockClearPlacements).not.toHaveBeenCalled()
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })
    })

    // -------------------------------------------------------------------------
    // reset() and setRenderer()

    describe('reset()', () => {
        it('clears pending games, shelf positions, and disposes renderer on library reload', async () => {
            const games = createMockGamesWithArtwork(5, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            await Promise.resolve()

            eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
            expect(mockRendererDispose).toHaveBeenCalled()

            // After full reset, SectionsReady should not place (renderer gone, no prefetch results)
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })
    })

    describe('ArrangementRequested — geometry reset', () => {
        it('clears placements but keeps renderer alive', async () => {
            const games = createMockGamesWithArtwork(5, 0) as any[]

            eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: 5,
                totalBatches: 1,
                appids: Array.from({ length: 5 }, (_, i) => i + 1),
            })
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            eventManager.emit(UIEventTypes.ArrangementRequested, { groupMode: 'by-recency', sortMode: 'by-last-played' } as any)
            expect(mockRendererDispose).not.toHaveBeenCalled()
            expect(mockClearPlacements).toHaveBeenCalled()
        })
    })

    describe('setRenderer(null)', () => {
        it('does not throw when renderer is cleared and GamesSort fires', () => {
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: createMockGamesWithArtwork(2, 0), batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
            expect(mockRendererDispose).toHaveBeenCalled()

            expect(() => {
                eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, { sections: [{ name: 'Test', games: createMockGamesWithArtwork(3, 0) as any[], groupMode: 'by-recency', sortMode: 'by-last-played' }], groupMode: 'by-recency', sortMode: 'by-last-played' })
            }).not.toThrow()
        })
    })
})
