import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { GameSorter } from '../../src/scene/categorization/GameSorter'
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import {
    GameEventTypes,
    SteamEventTypes,
    StorePropsEventTypes,
    UIEventTypes,
    type GamesPlacedEvent,
    type SteamLibraryManifestReadyEvent,
} from '../../src/types/InteractionEvents'
import type { ArrangementRequestedEvent, GameDataReadyEvent, LayoutRequestedEvent } from '../../src/types/EnvironmentEvents'
import { GroupModes, SortModes } from '../../src/types/LayoutTypes'
import type { SteamGame } from '../../src/steam'

vi.mock('../../src/utils/TextureManager', async () => {
    const { MockTextureManager } = await import('../mocks/utils/TextureManager.mock')
    return {
        TextureManager: {
            getInstance: () => MockTextureManager.getInstance(),
        },
    }
})

vi.mock('../../src/steam-integration/SteamIntegration', () => ({
    SteamIntegration: {
        getInstance: () => ({
            isAnonymous: () => true,
        }),
    },
}))

function makeGenreGames(count: number): SteamGame[] {
    const genres = ['Action', 'Adventure', 'RPG']
    return Array.from({ length: count }, (_, i) => ({
        appid: i + 1,
        name: `Genre Test ${i + 1}`,
        playtime_forever: i * 10,
        img_icon_url: '',
        img_logo_url: '',
        artwork: {
            library: `https://cdn.akamai.steamstatic.com/steam/apps/${i + 1}/library_600x900_stub.jpg`,
            header: `https://cdn.akamai.steamstatic.com/steam/apps/${i + 1}/header_stub.jpg`,
            icon: '',
            logo: '',
        },
        genres: [{ id: `${(i % genres.length) + 1}`, description: genres[i % genres.length] }],
    }))
}

describe('group then layout placement regression', () => {
    let scene: THREE.Scene
    let eventManager: EventManager
    let dataManager: DataManager
    let harness: StorePropsTestHarness

    beforeEach(() => {
        scene = new THREE.Scene()
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()

        dataManager = DataManager.getInstance()
        dataManager.clear()
        dataManager.set(DataKey.MainScene, scene, {
            domain: DataDomain.Scene,
            description: 'group-then-layout regression scene',
        })

        harness = createStorePropsTestHarness(scene)
        new GameSorter()
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.restoreAllMocks()
    })

    it('keeps placing games after switching group then layout', async () => {
        const games = makeGenreGames(24)

        dataManager.set('steam.games', games as any, {
            domain: DataDomain.SteamIntegration,
            description: 'group-then-layout test games',
        })

        const warnSpy = vi.spyOn(console, 'warn')
        let gamesPlacedCount = 0
        eventManager.registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            (_event: CustomEvent<GamesPlacedEvent>) => {
                gamesPlacedCount++
            }
        )

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: games.length,
        })

        eventManager.emit<ArrangementRequestedEvent>(UIEventTypes.ArrangementRequested, {
            groupMode: GroupModes.ByGenre,
            sortMode: SortModes.ByPlaytime,
        })

        await vi.waitFor(() => {
            expect(gamesPlacedCount).toBeGreaterThan(0)
        }, { timeout: 8000, interval: 50 })

        const beforeLayoutPlacedCount = gamesPlacedCount

        eventManager.emit<LayoutRequestedEvent>(UIEventTypes.LayoutRequested, {
            layoutMode: 'row',
        })

        // StorePropsCoordinator emits GameDataReady after layout changes in runtime.
        eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
            totalGames: games.length,
            totalBatches: Math.ceil(games.length / 18),
        })

        await vi.waitFor(() => {
            expect(gamesPlacedCount).toBeGreaterThan(beforeLayoutPlacedCount)
        }, { timeout: 8000, interval: 50 })

        const noShelfSpaceWarnings = warnSpy.mock.calls.filter(call =>
            call.some(arg => typeof arg === 'string' && arg.includes('had no shelf space'))
        )

        expect(noShelfSpaceWarnings).toHaveLength(0)
    })
})
