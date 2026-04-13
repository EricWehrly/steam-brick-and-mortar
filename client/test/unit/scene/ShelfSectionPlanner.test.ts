import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import { GameEventTypes, StorePropsEventTypes, type ShelfReadyEvent } from '../../../src/types/InteractionEvents'
import type { GamesSortEvent } from '../../../src/types/EnvironmentEvents'
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

// ─── ShelfSurfaceUtils stub ───────────────────────────────────────────────────

vi.mock('../../../src/scene/props/shared/ShelfSurfaceUtils', () => ({
    ShelfSurfaceUtils: { findShelfSurfaces: vi.fn().mockReturnValue([]) },
}))

import { ShelfSectionPlanner } from '../../../src/scene/ShelfSectionPlanner'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000)
const PLAYED_TODAY = NOW - 3600

function makeGame(rtimeLastPlayed: number, appid = Math.floor(Math.random() * 1e6)): SteamGameData {
    return { appid, name: 'Test Game', playtime_forever: 60, rtime_last_played: rtimeLastPlayed } as SteamGameData
}

function emitGamesSort(games: SteamGameData[]): void {
    EventManager.getInstance().emit<GamesSortEvent>(GameEventTypes.GamesSort, {
        sortedGames: games,
        buckets: new Map(),
    })
}

function emitShelfReady(batchIndex: number, position = new THREE.Vector3(0, 0, -5), rotationY = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        batchIndex,
        position,
        rotationY,
    })
}

// ─── Ceiling sign placement ───────────────────────────────────────────────────

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
        emitGamesSort([makeGame(0)])  // never played

        expect(removeSignByIdSpy).toHaveBeenCalledWith('Recently Played')
        const ceilingCalls = placeSignSpy.mock.calls.filter(
            ([, descriptor]) => descriptor.uniqueIdentifier === 'Recently Played'
        )
        expect(ceilingCalls.length).toBe(0)
    })
})

// ─── Bucket sign placement ────────────────────────────────────────────────────

describe('ShelfSectionPlanner — bucket signs', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('places a bucket sign on ShelfReady when recently-played data is present', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))
        emitGamesSort(games)
        vi.clearAllMocks()  // ignore ceiling sign call above

        emitShelfReady(0, new THREE.Vector3(10, 0, -20))  // far from ceiling anchor

        expect(placeSignSpy).toHaveBeenCalled()
    })

    it('does not place bucket sign when no recently-played data', () => {
        new ShelfSectionPlanner()
        emitGamesSort([makeGame(0)])
        vi.clearAllMocks()

        emitShelfReady(0)

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('clears bucket signs on repeated GamesSort', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))

        emitGamesSort(games)
        emitShelfReady(0, new THREE.Vector3(10, 0, -20))  // places a bucket sign
        vi.clearAllMocks()

        // second sort should clear the previously placed bucket sign
        emitGamesSort(games)
        expect(removeSignByIdSpy).toHaveBeenCalled()
    })
})
