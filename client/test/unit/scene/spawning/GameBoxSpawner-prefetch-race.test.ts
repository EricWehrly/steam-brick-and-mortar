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
    StorePropsEventTypes,
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
} from '../../../../src/types/InteractionEvents'
import type { SectionsReadyEvent } from '../../../../src/types/EnvironmentEvents'

// --- Mocks ---

const mockPrefetchArtwork = vi.fn()
const mockPlaceGame = vi.fn()
const mockClearPlacements = vi.fn()
const mockRendererDispose = vi.fn()

vi.mock('../../../../src/scene/game-box/GpuGameBoxRenderer', () => ({
    GpuGameBoxRenderer: vi.fn().mockImplementation(function () {
        this.prefetchArtwork = mockPrefetchArtwork
        this.placeGame = mockPlaceGame
        this.clearPlacements = mockClearPlacements
        this.dispose = mockRendererDispose
        this.addToScene = vi.fn()
        this.updateLODForCamera = vi.fn()
    })
}))

vi.mock('../../../../src/core/AppSettings', () => {
    const Setting = { EnableLabels: 'enableLabels' }
    const AppSettings = {
        get: vi.fn((key: string) => key === Setting.EnableLabels ? true : undefined)
    }
    return { AppSettings, Setting }
})

vi.mock('../../../../src/scene/props/SharedPropsUtils', () => ({
    ShelfSurfaceUtils: {
        findShelfSurfaces: vi.fn(() => [
            { y: 0.5, zMin: -1, zMax: 1, label: 'surface-0' },
        ])
    },
    GameBoxUtils: {
        calculateGamePositions: vi.fn((_shelf, _surface, games) =>
            games.map(() => new THREE.Vector3(0, 0, 0))
        ),
        calculateGameRotation: vi.fn(() => new THREE.Quaternion()),
    },
    GameLayoutConstants: {
        GAMES_PER_SURFACE: 9,
    },
    ShelfFace: { Back: 'Back', Front: 'Front' },
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

// --- Tests ---

describe('GameBoxSpawner — prefetch/place rendezvous probe', () => {
    let spawner: GameBoxSpawner

    beforeEach(() => {
        vi.clearAllMocks()
        spawner = new GameBoxSpawner()
    })

    afterEach(() => {
        spawner.dispose()
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

        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            batchIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })

        // SectionsReady fires before prefetch resolves — assigns intents only
        emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections: [{ name: 'Test', games, sortMode: 'recently-played' }],
            sortMode: 'recently-played',
        })

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

        emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
            batchIndex: 0,
            position: new THREE.Vector3(0, 0, -5),
            rotationY: 0,
        })

        // Prefetch already settled — placeGame fires synchronously during intent assignment
        emit<SectionsReadyEvent>(GameEventTypes.SectionsReady, {
            sections: [{ name: 'Test', games, sortMode: 'recently-played' }],
            sortMode: 'recently-played',
        })

        expect(mockPlaceGame).toHaveBeenCalledTimes(games.length)
    })
})
