/**
 * Unit Tests: GameBoxSpawner — Two-Phase Load/Place
 *
 * Tests verify the refactored GameBoxSpawner correctly:
 * 1. Phase 1 (BatchReadyForPlacement): renderer-owned prewarm pipeline stays active
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
    GameRenderEventTypes,
    StorePropsEventTypes,
    SteamEventTypes,
    GameEventTypes,
    UIEventTypes,
    type ArtworkIntentSettledEvent,
    type BatchReadyForPlacementEvent,
    type PlacementIntentReadyEvent,
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
const mockResetPendingPlacementIntents = vi.fn()
const mockRendererDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/GpuGameBoxRenderer', async () => {
    const { ArtworkPrefetchCoordinator } = await import('../../../../src/scene/spawning/ArtworkPrefetchCoordinator')
    return {
        GpuGameBoxRenderer: vi.fn().mockImplementation(function() {
            this.prefetchArtwork = mockPrefetchArtwork
            this.placeGame = mockPlaceGame
            this.resetPendingPlacementIntents = mockResetPendingPlacementIntents
            this.clearPlacements = vi.fn(() => {
                mockClearPlacements()
                mockResetPendingPlacementIntents()
            })
            this.addToScene = vi.fn()
            this.updateLODForCamera = vi.fn()
            const coordinator = new ArtworkPrefetchCoordinator({ renderer: this })
            this.dispose = vi.fn(() => {
                mockRendererDispose()
                coordinator.dispose()
            })
        })
    }
})

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

function makeShelfReady(
    shelfIndex: number,
    position = new THREE.Vector3(0, 0, 0),
    rotationY = 0,
    sectionIndex = 0
): ShelfReadyEvent {
    return { shelfIndex, sectionIndex, position, rotationY }
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

function wireRenderIntentRendezvous(em: EventManager): () => void {
    const settledAppIds = new Set<number>()
    const pendingIntents = new Map<number, PlacementIntentReadyEvent[]>()

    const flush = (appid: number) => {
        if (!settledAppIds.has(appid)) return

        const intents = pendingIntents.get(appid)
        if (!intents || intents.length === 0) return

        while (intents.length > 0) {
            const intent = intents.shift()
            if (!intent) break
            mockPlaceGame(intent.game, intent.position, intent.rotation)
        }

        pendingIntents.delete(appid)
    }

    em.registerEventHandler(
        GameRenderEventTypes.ArtworkIntentSettled,
        (event: CustomEvent<ArtworkIntentSettledEvent>) => {
            settledAppIds.add(event.detail.appid)
            flush(event.detail.appid)
        }
    )

    em.registerEventHandler(
        GameRenderEventTypes.PlacementIntentReady,
        (event: CustomEvent<PlacementIntentReadyEvent>) => {
            const pending = pendingIntents.get(event.detail.appid) ?? []
            pending.push(event.detail)
            pendingIntents.set(event.detail.appid, pending)
            flush(event.detail.appid)
        }
    )

    return () => {
        pendingIntents.clear()
    }
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

        vi.mocked(eventManager.deregisterEventHandler).mockImplementation((eventType: string, handler: Function) => {
            eventHandlers.get(eventType)?.delete(handler)
        })

        vi.mocked(eventManager.emit).mockImplementation((eventType: string, detail: any) => {
            const handlers = eventHandlers.get(eventType)
            if (handlers) {
                const event = new CustomEvent(eventType, { detail })
                handlers.forEach(handler => handler(event))
            }
            return true
        })

        const clearPendingIntents = wireRenderIntentRendezvous(eventManager)
        mockResetPendingPlacementIntents.mockImplementation(() => clearPendingIntents())

        spawner = new (GameBoxSpawner as any)()
        // Ordering contract: renderer is initialized from immutable manifest before any batch prewarm events.
        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: 500,
        })
        emitShelfLayoutDetermined(eventManager)
    })

    afterEach(() => {
        vi.clearAllMocks()
        mockPrefetchArtwork.mockResolvedValue('prefetched')
        mockPlaceGame.mockReset()
        mockResetPendingPlacementIntents.mockReset()
    })

    // -------------------------------------------------------------------------
    // Phase 1: Prewarm

    describe('Phase 1 — BatchReadyForPlacement prewarm pipeline', () => {
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

        it('places games when SectionsReady arrives after ShelfLayoutDetermined', async () => {
            const games = createMockGamesWithArtwork(4, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(0, 0, 0))
            )
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(1, new THREE.Vector3(3, 0, 0))
            )
            emitShelfLayoutDetermined(eventManager)

            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }],
                groupMode: 'by-recency',
                sortMode: 'by-last-played',
            })

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).toHaveBeenCalledTimes(4)
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

        it('places the same prefetched game once per section appearance', async () => {
            const sharedGame = createMockGamesWithArtwork(1, 0)[0] as any

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: [sharedGame], batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [
                    { name: 'Action', games: [sharedGame], groupMode: 'by-genre', sortMode: 'by-playtime' },
                    { name: 'Indie', games: [sharedGame], groupMode: 'by-genre', sortMode: 'by-playtime' },
                ],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            })
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(0, 0, 0), 0, 0)
            )
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(1, new THREE.Vector3(3, 0, 0), 0, 1)
            )
            emitShelfLayoutDetermined(eventManager)

            expect(mockPlaceGame).toHaveBeenCalledTimes(2)
            expect(mockPlaceGame.mock.calls[0][0].appid).toBe(sharedGame.appid)
            expect(mockPlaceGame.mock.calls[1][0].appid).toBe(sharedGame.appid)
            expect(mockPlaceGame.mock.calls[0][1]).not.toEqual(mockPlaceGame.mock.calls[1][1])
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

        it('drops stale pending intents when a new SectionsReady run starts before layout', () => {
            const staleGame = createMockGames(1, 0)[0] as any
            const run2Game = createMockGames(1, 1)[0] as any

            // Run 1: placement intent is emitted for a game with no artwork settle yet.
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Run1', games: [staleGame], groupMode: 'by-genre', sortMode: 'by-playtime' }],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0, new THREE.Vector3(0, 0, 0), 0, 0))
            emitShelfLayoutDetermined(eventManager)

            expect(mockPlaceGame).toHaveBeenCalledTimes(0)

            // Run 2 starts before its layout; run-start reset should drop run-1 pending intents.
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Run2', games: [run2Game], groupMode: 'by-genre', sortMode: 'by-playtime' }],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            })

            eventManager.emit<ArtworkIntentSettledEvent>(
                GameRenderEventTypes.ArtworkIntentSettled,
                { appid: staleGame.appid, gameName: staleGame.name }
            )

            // Late settle from run 1 must not replay stale placement.
            expect(mockPlaceGame).toHaveBeenCalledTimes(0)

            // Run 2 still places normally once layout and settle occur.
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0, new THREE.Vector3(3, 0, 0), 0, 0))
            emitShelfLayoutDetermined(eventManager)
            eventManager.emit<ArtworkIntentSettledEvent>(
                GameRenderEventTypes.ArtworkIntentSettled,
                { appid: run2Game.appid, gameName: run2Game.name }
            )

            expect(mockPlaceGame).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame.mock.calls[0][0].appid).toBe(run2Game.appid)
        })

        it('re-sort keeps multi-group duplicates for the new run while dropping stale intents', async () => {
            const staleGame = createMockGames(1, 0)[0] as any
            const sharedRun2Game = createMockGamesWithArtwork(1, 2)[0] as any

            // Run 1 queues a single placement intent that never settles.
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Run1', games: [staleGame], groupMode: 'by-genre', sortMode: 'by-playtime' }],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0, new THREE.Vector3(0, 0, 0), 0, 0))
            emitShelfLayoutDetermined(eventManager)

            // Run 2 boundary: arrangement change clears geometry-owned placement state.
            eventManager.emit(UIEventTypes.ArrangementRequested, {
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            } as any)

            // Run 2 starts before run-1 settle; stale pending intents should be dropped.
            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [
                    { name: 'Action', games: [sharedRun2Game], groupMode: 'by-genre', sortMode: 'by-playtime' },
                    { name: 'Indie', games: [sharedRun2Game], groupMode: 'by-genre', sortMode: 'by-playtime' },
                ],
                groupMode: 'by-genre',
                sortMode: 'by-playtime',
            })

            eventManager.emit<ArtworkIntentSettledEvent>(
                GameRenderEventTypes.ArtworkIntentSettled,
                { appid: staleGame.appid, gameName: staleGame.name }
            )
            expect(mockPlaceGame).toHaveBeenCalledTimes(0)

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games: [sharedRun2Game], batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            // Run 2 layout + settle should place duplicated intents once per section appearance.
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(0, new THREE.Vector3(2, 0, 0), 0, 0)
            )
            eventManager.emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                makeShelfReady(1, new THREE.Vector3(5, 0, 0), 0, 1)
            )
            emitShelfLayoutDetermined(eventManager)

            eventManager.emit<ArtworkIntentSettledEvent>(
                GameRenderEventTypes.ArtworkIntentSettled,
                { appid: sharedRun2Game.appid, gameName: sharedRun2Game.name }
            )

            expect(mockPlaceGame).toHaveBeenCalledTimes(2)
            expect(mockPlaceGame.mock.calls[0][0].appid).toBe(sharedRun2Game.appid)
            expect(mockPlaceGame.mock.calls[1][0].appid).toBe(sharedRun2Game.appid)
            expect(mockPlaceGame.mock.calls[0][1]).not.toEqual(mockPlaceGame.mock.calls[1][1])
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

        it('does not throw on library reload before the first renderer initialization', () => {
            resetEventManager()
            const isolatedEventManager = EventManager.getInstance()
            const isolatedHandlers = new Map<string, Set<Function>>()

            vi.mocked(isolatedEventManager.registerEventHandler).mockImplementation((eventType: string, handler: Function) => {
                if (!isolatedHandlers.has(eventType)) isolatedHandlers.set(eventType, new Set())
                isolatedHandlers.get(eventType)!.add(handler)
            })
            vi.mocked(isolatedEventManager.deregisterEventHandler).mockImplementation((eventType: string, handler: Function) => {
                isolatedHandlers.get(eventType)?.delete(handler)
            })
            vi.mocked(isolatedEventManager.emit).mockImplementation((eventType: string, detail: any) => {
                const handlers = isolatedHandlers.get(eventType)
                if (handlers) {
                    const event = new CustomEvent(eventType, { detail })
                    handlers.forEach(handler => handler(event))
                }
                return true
            })

            const earlySpawner = new (GameBoxSpawner as any)()

            expect(() => {
                isolatedEventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
            }).not.toThrow()

            expect(earlySpawner).toBeDefined()
        })

        it('reinitializes renderer-owned prefetch listeners once after reload without duplicates', async () => {
            const games = createMockGamesWithArtwork(2, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()
            expect(mockPrefetchArtwork).toHaveBeenCalledTimes(2)

            eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
            eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: 500,
            })

            mockPrefetchArtwork.mockClear()

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            expect(mockPrefetchArtwork).toHaveBeenCalledTimes(2)
        })
    })

    describe('ArrangementRequested — geometry reset', () => {
        it('clears placements but keeps renderer alive', async () => {
            const games = createMockGamesWithArtwork(5, 0) as any[]

            eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
                totalGames: 5,
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

    describe('LayoutRequested — placement replay', () => {
        it('does not clear placements until the next SectionsReady run starts', async () => {
            const games = createMockGamesWithArtwork(4, 0) as any[]

            eventManager.emit<BatchReadyForPlacementEvent>(
                StorePropsEventTypes.BatchReadyForPlacement,
                { games, batchIndex: 0, totalBatches: 1 }
            )
            await Promise.resolve()

            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' }],
                groupMode: 'by-recency',
                sortMode: 'by-last-played',
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            emitShelfLayoutDetermined(eventManager)

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)

            mockClearPlacements.mockClear()
            mockPlaceGame.mockClear()

            eventManager.emit(UIEventTypes.LayoutRequested, { layoutMode: 'grid' } as any)

            expect(mockClearPlacements).not.toHaveBeenCalled()

            eventManager.emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
                sections: [{ name: 'Test', games: [...games].reverse() as any, groupMode: 'by-recency', sortMode: 'by-last-played' }],
                groupMode: 'by-recency',
                sortMode: 'by-last-played',
            })
            eventManager.emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, makeShelfReady(0))
            emitShelfLayoutDetermined(eventManager)

            expect(mockClearPlacements).toHaveBeenCalledTimes(1)
            expect(mockPlaceGame).toHaveBeenCalledTimes(4)
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
