import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../src/core/data'
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../helpers/StorePropsTestHarness'
import { GameSorter } from '../../src/scene/categorization/GameSorter'
import {
    SteamEventTypes,
    GameEventTypes,
    type SteamLibraryManifestReadyEvent,
    type SteamGamesBatchEvent,
} from '../../src/types/InteractionEvents'
import type { SteamGame } from '../../src/steam'
import type { GameDataReadyEvent } from '../../src/types/EnvironmentEvents'

const mockPrefetchArtwork = vi.fn().mockResolvedValue('prefetched')
const mockPlaceGame = vi.fn()
const mockClearPlacements = vi.fn()
const mockDispose = vi.fn()

vi.mock('../../src/scene/game-box/GpuGameBoxRenderer', () => ({
    GpuGameBoxRenderer: vi.fn().mockImplementation(function () {
        this.prefetchArtwork = mockPrefetchArtwork
        this.placeGame = mockPlaceGame
        this.placeLabelBox = vi.fn()
        this.clearPlacements = mockClearPlacements
        this.dispose = mockDispose
        this.addToScene = vi.fn()
        this.updateLODForCamera = vi.fn()
    })
}))

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

function makeMultiGenreGame(): SteamGame {
    return {
        appid: 101,
        name: 'Shared Genre Game',
        playtime_forever: 42,
        img_icon_url: '',
        img_logo_url: '',
        artwork: {
            library: 'https://cdn.akamai.steamstatic.com/steam/apps/101/library_600x900.jpg',
            header: 'https://cdn.akamai.steamstatic.com/steam/apps/101/header.jpg',
            icon: '',
            logo: '',
        },
        genres: [
            { id: '1', description: 'Action' },
            { id: '2', description: 'RPG' },
        ],
    }
}

describe('multi-genre placement integration', () => {
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
            description: 'multi-genre placement integration scene',
        })

        harness = createStorePropsTestHarness(scene)
        new GameSorter()
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    it('places the same game once per emitted genre section', async () => {
        const sharedGame = makeMultiGenreGame()
        const games = [sharedGame]

        dataManager.set('steam.games', games as any, {
            domain: DataDomain.SteamIntegration,
            description: 'multi-genre test games',
        })

        eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            totalGames: games.length,
        })

        eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
            games,
            batchIndex: 0,
            totalBatches: 1,
        })

        eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
            totalGames: games.length,
            totalBatches: 1,
        })

        await vi.waitFor(() => {
            expect(mockPlaceGame).toHaveBeenCalledTimes(2)
        }, { timeout: 8000, interval: 50 })

        expect(mockPlaceGame.mock.calls[0][0].appid).toBe(sharedGame.appid)
        expect(mockPlaceGame.mock.calls[1][0].appid).toBe(sharedGame.appid)
        expect(mockPlaceGame.mock.calls[0][1]).not.toEqual(mockPlaceGame.mock.calls[1][1])
    })
})