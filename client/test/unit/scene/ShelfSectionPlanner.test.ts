import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { EventManager } from '../../../src/core/EventManager'
import {
    GameEventTypes,
    StorePropsEventTypes,
    type ShelfReadyEvent,
} from '../../../src/types/InteractionEvents'
import type { GamesSortEvent, GameSortMode } from '../../../src/types/EnvironmentEvents'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

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

const NOW = Math.floor(Date.now() / 1000)
const PLAYED_TODAY = NOW - 3600
const FAR_POSITION = new THREE.Vector3(10, 0, -20)

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

function emitShelfReady(batchIndex: number, position = FAR_POSITION, rotationY = 0): void {
    EventManager.getInstance().emit<ShelfReadyEvent>(StorePropsEventTypes.ShelfReady, {
        batchIndex,
        position,
        rotationY,
    })
}

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

    it('places a "Never Played" bucket sign for unplayed games in recently-played sort', () => {
        new ShelfSectionPlanner()
        // Games with rtime_last_played=0 are in the Unplayed bucket — still get a sign
        emitGamesSort([makeGame(0)], 'recently-played')
        vi.clearAllMocks()

        emitShelfReady(0)

        expect(placeSignSpy).toHaveBeenCalled()
    })

    it('replays bucket signs across accumulated shelf positions on re-sort', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY))

        emitShelfReady(0, FAR_POSITION)
        emitGamesSort(games, 'recently-played')
        vi.clearAllMocks()

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

describe('ShelfSectionPlanner — section signs (genre sort)', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('does not place bucket signs during genre sort ShelfReady', () => {
        new ShelfSectionPlanner()
        const games = Array.from({ length: 18 }, () => makeGame(PLAYED_TODAY, 'Action'))
        emitGamesSort(games, 'by-genre')
        vi.clearAllMocks()

        emitShelfReady(0, FAR_POSITION)

        expect(placeSignSpy).not.toHaveBeenCalled()
    })

    it('places genre section signs when switching to by-genre using sortedGames payload', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)

        const genreSortedGames = [
            makeGame(PLAYED_TODAY, 'Action', 1),
            makeGame(PLAYED_TODAY, 'Action', 2),
            makeGame(PLAYED_TODAY, 'Strategy', 3),
            makeGame(PLAYED_TODAY, 'Strategy', 4),
        ]

        emitGamesSort(genreSortedGames, 'by-genre')

        const placedIdentifiers = placeSignSpy.mock.calls.map(([, descriptor]) => descriptor.uniqueIdentifier)
        expect(placedIdentifiers).toContain('Action')
        expect(placedIdentifiers).toContain('Strategy')
    })

    it('clears section signs when switching sort modes', () => {
        new ShelfSectionPlanner()
        emitShelfReady(0, FAR_POSITION)

        const genreSortedGames = [
            makeGame(PLAYED_TODAY, 'Action', 1),
            makeGame(PLAYED_TODAY, 'Action', 2),
        ]

        emitGamesSort(genreSortedGames, 'by-genre')
        vi.clearAllMocks()

        emitGamesSort(genreSortedGames, 'recently-played')
        expect(removeSignByIdSpy).toHaveBeenCalledWith('Action')
    })
})
