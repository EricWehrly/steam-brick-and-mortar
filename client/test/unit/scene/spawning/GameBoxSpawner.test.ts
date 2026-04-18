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
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type GamesPlacedEvent,
} from '../../../../src/types/InteractionEvents'
import type { GamesSortEvent } from '../../../../src/types/EnvironmentEvents'
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

function makeShelfReady(batchIndex: number, position = new THREE.Vector3(0, 0, 0), rotationY = 0): ShelfReadyEvent {
    return { batchIndex, position, rotationY }
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

        spawner = new GameBoxSpawner()
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
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(0, 0, 0))
            )

            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })

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
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })

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
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0, new THREE.Vector3(0, 0, 0)))
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(1, new THREE.Vector3(3, 0, 0)))

            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).toHaveBeenCalledTimes(20)
        })

        it('re-sort triggers a fresh clearPlacements call each time', () => {
            const games = createMockGamesWithArtwork(4, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })
            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: [...games].reverse(), buckets: new Map(), sortMode: 'recently-played' })

            expect(mockClearPlacements).toHaveBeenCalledTimes(2)
        })

        it('handles empty sorted list gracefully', () => {
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: createMockGamesWithArtwork(1, 0), batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            expect(() => {
                eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: [], buckets: new Map(), sortMode: 'recently-played' })
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
            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })
    })

    // -------------------------------------------------------------------------
    // reset() and setRenderer()

    describe('reset()', () => {
        it('clears pending games, shelf positions, and disposes renderer', async () => {
            const games = createMockGamesWithArtwork(5, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            await Promise.resolve()

            spawner.reset()
            expect(mockRendererDispose).toHaveBeenCalled()

            // After reset, GamesSort should not use old shelf positions (renderer gone)
            eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: games, buckets: new Map(), sortMode: 'recently-played' })
            expect(mockPlaceGame).not.toHaveBeenCalled()
        })
    })

    describe('setRenderer(null)', () => {
        it('does not throw when renderer is cleared and GamesSort fires', () => {
            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: createMockGamesWithArtwork(2, 0), batchIndex: 0, totalBatches: 1 }
            )
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))

            spawner.reset()
            expect(mockRendererDispose).toHaveBeenCalled()

            expect(() => {
                eventManager.emit<GamesSortEvent>(GameEventTypes.GamesSort, { sortedGames: createMockGamesWithArtwork(3, 0) as any[], buckets: new Map(), sortMode: 'recently-played' })
            }).not.toThrow()
        })
    })
})
