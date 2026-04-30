/**
 * Probe: GameBoxSpawner — prefetch/place rendezvous
 *
 * Verifies the rendezvous fix: each game places itself as soon as both
 * prefetch has settled AND a placement intent exists, whichever arrives last.
 *
 * Previously (before the fix): GamesSort fired immediately and called
 * placeArtworkInstance() while the atlas was empty, causing all games to
 * fall through to label boxes.
 *
 * Now: placement is deferred until both conditions are met, so artwork
 * trickles in naturally as prefetches settle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../../src/core/EventManager'
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

// --- Mocks ---

const mockPrefetchArtwork = vi.fn()
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
        })
    }
})

vi.mock('../../../../src/core/AppSettings', () => {
    const Setting = { EnableLabels: 'enableLabels' }
    const AppSettings = {
        get: vi.fn((key: string) => key === Setting.EnableLabels ? true : undefined)
    }
    return { AppSettings, Setting }
})

vi.mock('../../../../src/scene/props/SharedPropsUtils', () => ({
    ArcStockStrategy: class { order(boards: any[]) { return boards.map((b: any) => b.near) } },
    ShelfSurfaceUtils: {
        findShelfSurfaces: vi.fn(() => [
            { topY: 0.5, frontZ: -0.5, backZ: 0.5, centerX: 0, width: 2.0 },
        ])
    },
    GameBoxUtils: {
        buildStockSurfaces: vi.fn((_pos, _rot, _boards) => [
            {
                originPosition: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Quaternion(),
                slotStep: new THREE.Vector3(0.55, 0, 0),
                capacity: 9,
            },
        ]),
        stockSurfaces: vi.fn((surfaces, games) =>
            games.map((game: any) => ({
                game,
                position: new THREE.Vector3(0, 0, 0),
                rotation: new THREE.Quaternion(),
            }))
        ),
    },
    GameLayoutConstants: {
        GAMES_PER_SURFACE: 9,
    },
    ShelfFace: { Near: 'near', Far: 'far' },
}))

// --- Helpers ---

function makeGame(appid: number, name: string) {
    return {
        appid,
        name,
        playtime_forever: 0,
        img_icon_url: '',
        img_logo_url: '',
        artwork: { library: `https://cdn.example.com/${appid}.jpg`, icon: '', logo: '', header: '' },
    }
}

function emit<T>(type: string, detail: T) {
    EventManager.getInstance().emit(type, detail)
}

function emitShelfLayoutDetermined() {
    const mockStrategy = { order: (boards: any[]) => boards.map((b: any) => b.near) }
    emit<ShelfLayoutDeterminedEvent>(GameEventTypes.ShelfLayoutDetermined, {
        shelfBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
        shelfLayout: { rows: 1 },
        stockStrategy: mockStrategy as any,
    })
}

function wireRenderIntentRendezvous(): void {
    const settledAppIds = new Set<number>()
    const pending = new Map<number, PlacementIntentReadyEvent[]>()

    EventManager.getInstance().registerEventHandler(
        GameRenderEventTypes.PlacementRunResetRequested,
        () => {
            mockClearPlacements()
        }
    )

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

    EventManager.getInstance().registerEventHandler(
        GameRenderEventTypes.ArtworkIntentSettled,
        (event: CustomEvent<ArtworkIntentSettledEvent>) => {
            settledAppIds.add(event.detail.appid)
            flush(event.detail.appid)
        }
    )
    EventManager.getInstance().registerEventHandler(
        GameRenderEventTypes.PlacementIntentReady,
        (event: CustomEvent<PlacementIntentReadyEvent>) => {
            const intents = pending.get(event.detail.appid) ?? []
            intents.push(event.detail)
            pending.set(event.detail.appid, intents)
            flush(event.detail.appid)
        }
    )
}

// --- Tests ---

describe('GameBoxSpawner — prefetch/place rendezvous probe', () => {
    let spawner: GameBoxSpawner

    beforeEach(() => {
        vi.clearAllMocks()
        EventManager.getInstance().removeAllListeners()
        wireRenderIntentRendezvous()
        spawner = new (GameBoxSpawner as any)()

        emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: 2,
        })

        emitShelfLayoutDetermined()
    })

    afterEach(() => {
        EventManager.getInstance().removeAllListeners()
    })

    it('PROBE: intent arrives before prefetch — placeGame fires when prefetch settles', async () => {
        // Slow prefetch — simulates in-flight network requests
        let resolvePrefetch!: () => void
        const slowPrefetch = new Promise<'prefetched'>((resolve) => {
            resolvePrefetch = () => resolve('prefetched')
        })
        mockPrefetchArtwork.mockReturnValue(slowPrefetch)

        const games = [makeGame(1, 'Game A'), makeGame(2, 'Game B')]

        // Phase 1: batch arrives, prefetches are triggered but NOT resolved
        emit<BatchReadyForPlacementEvent>(StorePropsEventTypes.BatchReadyForPlacement, {
            games,
            batchIndex: 0,
            totalBatches: 1,
        })

        expect(mockPrefetchArtwork).toHaveBeenCalledTimes(2)
        expect(mockClearPlacements).not.toHaveBeenCalled()

        // SectionsReady first — caches sections and clears stale positions
        emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            sections: [{
                sectionId: 'by-recency:test:0',
                sectionIndex: 0,
                section: { name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' },
            }],
            groupMode: 'by-recency',
            sortMode: 'by-last-played',
        })
        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            shelfIndex: 0,
            sectionIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })
        // ShelfLayoutDetermined triggers placement attempt (prefetch still pending)
        emitShelfLayoutDetermined()

        expect(mockClearPlacements).toHaveBeenCalledTimes(1)
        // Intents assigned but prefetch not settled — placeGame not called yet
        expect(mockPlaceGame.mock.calls.length).toBe(0)

        // Settle the prefetch — tryPlace fires for each game
        resolvePrefetch()
        await slowPrefetch
        await new Promise(r => setTimeout(r, 0)) // flush microtasks

        // Both games placed via rendezvous
        expect(mockPlaceGame.mock.calls.length).toBe(games.length)
    })

    it('PROBE: duplicate section intents survive until a single prefetch settles', async () => {
        let resolvePrefetch!: () => void
        const slowPrefetch = new Promise<'prefetched'>((resolve) => {
            resolvePrefetch = () => resolve('prefetched')
        })
        mockPrefetchArtwork.mockReturnValue(slowPrefetch)

        const sharedGame = makeGame(1, 'Shared Game')

        emit<BatchReadyForPlacementEvent>(StorePropsEventTypes.BatchReadyForPlacement, {
            games: [sharedGame],
            batchIndex: 0,
            totalBatches: 1,
        })

        emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            sections: [
                {
                    sectionId: 'by-genre:action:0',
                    sectionIndex: 0,
                    section: { name: 'Action', games: [sharedGame], groupMode: 'by-genre', sortMode: 'by-playtime' },
                },
                {
                    sectionId: 'by-genre:indie:1',
                    sectionIndex: 1,
                    section: { name: 'Indie', games: [sharedGame], groupMode: 'by-genre', sortMode: 'by-playtime' },
                },
            ],
            groupMode: 'by-genre',
            sortMode: 'by-playtime',
        })
        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            shelfIndex: 0,
            sectionIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })
        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            shelfIndex: 1,
            sectionIndex: 1,
            position: new THREE.Vector3(3, 0, -5),
            rotationY: 0,
        })
        emitShelfLayoutDetermined()

        expect(mockPlaceGame).not.toHaveBeenCalled()

        resolvePrefetch()
        await slowPrefetch
        await new Promise(r => setTimeout(r, 0))

        expect(mockPlaceGame).toHaveBeenCalledTimes(2)
        expect(mockPlaceGame.mock.calls[0][0].appid).toBe(sharedGame.appid)
        expect(mockPlaceGame.mock.calls[1][0].appid).toBe(sharedGame.appid)
    })

    it('PROBE: prefetch arrives before intent — placeGame fires when GamesSort assigns position', async () => {
        mockPrefetchArtwork.mockResolvedValue('prefetched')

        const games = [makeGame(1, 'Game A'), makeGame(2, 'Game B')]

        emit<BatchReadyForPlacementEvent>(StorePropsEventTypes.BatchReadyForPlacement, {
            games,
            batchIndex: 0,
            totalBatches: 1,
        })

        // Wait for prefetch microtasks to settle before GamesSort
        await new Promise(r => setTimeout(r, 0))

        // SectionsReady first — caches sections, ShelfReady then ShelfLayoutDetermined
        emit<SectionsReadyForPlacementEvent>(GameEventTypes.SectionsReadyForPlacement, {
            sections: [{
                sectionId: 'by-recency:test:0',
                sectionIndex: 0,
                section: { name: 'Test', games, groupMode: 'by-recency', sortMode: 'by-last-played' },
            }],
            groupMode: 'by-recency',
            sortMode: 'by-last-played',
        })
        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            shelfIndex: 0,
            sectionIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })
        // ShelfLayoutDetermined triggers placement (prefetch already resolved)
        emitShelfLayoutDetermined()

        expect(mockPlaceGame).toHaveBeenCalledTimes(games.length)
    })
})
