import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfReadyEvent,
    type BatchReadyForPlacementEvent,
} from '../../../src/types/InteractionEvents'
import type { GamesSortEvent, GameSortMode } from '../../../src/types/EnvironmentEvents'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

// ─── SceneSignManager mock ────────────────────────────────────────────────────

const placeSignSpy = vi.fn().mockReturnValue(new THREE.Group())
const removeSignByIdSpy = vi.fn()
const clearAllSpy = vi.fn()
const disposeSpy = vi.fn()

vi.mock('../../../src/scene/SceneSignManager', () => ({
    SceneSignManager: {
        get instance() {
            return {
                placeSign: placeSignSpy,
                removeSignById: removeSignByIdSpy,
                clearAll: clearAllSpy,
                dispose: disposeSpy,
            }
        },
    },
    SignStyles: {
        Category: { backgroundColor: 0x1a3a5c, textColor: 0xffffff, fontSize: 0.18, padding: '0.10 0.18' },
    },
}))

vi.mock('../../../src/scene/props/shared/ShelfSurfaceUtils', () => ({
    ShelfSurfaceUtils: { findShelfSurfaces: vi.fn().mockReturnValue([]) },
}))

import { ShelfSectionPlanner } from '../../../src/scene/ShelfSectionPlanner'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000)
const PLAYED_TODAY = NOW - 3600
const FAR_POSITION = new THREE.Vector3(10, 0, -20)  // far from ceiling anchor, avoids collision

function makeGame(
    rtimeLastPlayed: number,
    genreDescription?: string,
    appid = Math.floor(Math.random() * 1e6)
): SteamGameData {
    return {
        appid,
        name: 'Test Game',
        playtime_forever: 60,
        rtime_last_played: rtimeLastPlayed,
        genres: genreDescription ? [{ id: '1', description: genreDescription }] : undefined,
    } as SteamGameData
}

function emitGamesSort(games: SteamGameData[], sortMode: GameSortMode = 'recently-played'): void {
    EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
        sortedGames: games as unknown as ReadonlyArray<Readonly<SteamGameData>>,
        buckets: new Map(),
        sortMode,
    })
}

function emitBatchReady(games: SteamGameData[]): void {
    EventManager.getInstance().emit<BatchReadyForPlacementEvent>(
        StorePropsEventTypes.BatchReadyForPlacement,
        {
            batchIndex: 0,
            totalBatches: 1,
            games: games as any,
        }
    )
}

function emitShelfReady(batchIndex: number, position = FAR_POSITION, rotationY = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        batchIndex,
        position,
        rotationY,
    })
}

// ─── Ceiling sign ─────────────────────────────────────────────────────────────

describe('ShelfSectionPlanner — ceiling sign', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('places ceiling sign on GamesSort when recently-played data is present', () => {
        new ShelfSectionPlanner()
        emitGamesSort([makeGame(PLAYED_TODAY)])

        const ceilingCalls = placeSignSpy.mock.calls.filter(
            ([, descriptor]) => descriptor.uniqueIdentifier === 'Recently Played'
        )
        expect(ceilingCalls.length).toBe(1)
    })

    it('removes ceiling sign on GamesSort when no recently-played data', () => {
        new ShelfSectionPlanner()
        emitGamesSort([makeGame(0)])

        expect(removeSignByIdSpy).toHaveBeenCalledWith('Recently Played')
        const ceilingCalls = placeSignSpy.mock.calls.filter(
            ([, descriptor]) => descriptor.uniqueIdentifier === 'Recently Played'
        )
        expect(ceilingCalls.length).toBe(0)
    })
})

// ─── Bucket signs (recency sort) ─────────────────────────────────────────────

describe('ShelfSectionPlanner — bucket signs (recently-played sort)', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('places a bucket sign on ShelfReady when recently-played data is present', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))
        emitGamesSort(games, 'recently-played')
        vi.clearAllMocks()

        emitShelfReady(0, FAR_POSITION)

        expect(placeSignSpy).toHaveBeenCalled()
    })

    it('does not place bucket sign when no recently-played data', () => {
        new ShelfSectionPlanner()
        emitGamesSort([makeGame(0)], 'recently-played')
        vi.clearAllMocks()

        emitShelfReady(0)

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('replays bucket signs across accumulated shelf positions on re-sort', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))

        // Shelf positions arrive during initial load
        emitShelfReady(0, FAR_POSITION)
        emitGamesSort(games, 'recently-played')
        vi.clearAllMocks()

        // Re-sort replays bucket signs using stored positions
        emitGamesSort(games, 'recently-played')
        expect(placeSignSpy).toHaveBeenCalled()
    })

    it('clears bucket signs before re-sort', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))

        emitGamesSort(games, 'recently-played')
        emitShelfReady(0, FAR_POSITION)
        vi.clearAllMocks()

        emitGamesSort(games, 'recently-played')
        expect(removeSignByIdSpy).toHaveBeenCalled()
    })
})

// ─── Section signs (genre sort) ───────────────────────────────────────────────

describe('ShelfSectionPlanner — section signs (genre sort)', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('does not place bucket signs during genre sort ShelfReady', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))
        emitGamesSort(games, 'by-genre')
        vi.clearAllMocks()

        emitShelfReady(0, FAR_POSITION)

        // No bucket signs during genre sort (ShelfReady is ignored for sign placement in genre mode)
        const bucketCalls = placeSignSpy.mock.calls.filter(
            ([, descriptor]) => descriptor.uniqueIdentifier !== 'Recently Played'
        )
        expect(bucketCalls.length).toBe(0)
    })

    it('clears section signs when switching sort modes', () => {
        new ShelfSectionPlanner()
        // Simulate accumulated batch + shelf data
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY, 'Action'))
        emitBatchReady(games)
        emitShelfReady(0, FAR_POSITION)

        // First sort: genre (places section signs)
        emitGamesSort(games, 'by-genre')
        vi.clearAllMocks()

        // Switch to recency sort: section signs should be cleared
        emitGamesSort(games, 'recently-played')
        expect(removeSignByIdSpy).toHaveBeenCalledWith('Action')
    })
})
