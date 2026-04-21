import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../../../src/core/EventManager'
import { DataDomain, DataKey, DataManager } from '../../../../src/core/data'
import { createStorePropsTestHarness, type StorePropsTestHarness } from '../../../helpers/StorePropsTestHarness'
import {
    SteamEventTypes,
    StorePropsEventTypes,
    GameEventTypes,
    type SteamGamesBatchEvent,
    type BatchReadyForPlacementEvent,
} from '../../../../src/types/InteractionEvents'

vi.mock('../../../../src/utils/TextureManager', async () => {
    const { MockTextureManager } = await import('../../../mocks/utils/TextureManager.mock')
    return {
        TextureManager: {
            getInstance: () => MockTextureManager.getInstance(),
        },
    }
})

describe('BatchCoordinator → GameDataReady ordering', () => {
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
            description: 'batch-ordering test scene',
        })

        harness = createStorePropsTestHarness(scene)
    })

    afterEach(() => {
        harness?.dispose()
        eventManager.removeAllListeners()
        dataManager.clear()
        scene.clear()
        vi.clearAllMocks()
    })

    it('does not emit GameDataReady by itself; SteamIntegration emits it after steam.games is populated', async () => {
        const observedEventOrder: string[] = []

        eventManager.registerEventHandler(
            GameEventTypes.GameDataReady,
            (_event: CustomEvent<{ totalGames: number; totalBatches: number }>) => {
                observedEventOrder.push('game-data-ready')
            }
        )

        eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (_event: CustomEvent<BatchReadyForPlacementEvent>) => {
                observedEventOrder.push('batch-ready-for-placement')
            }
        )

        const firstBatchGames = Array.from({ length: 18 }, (_, index) => ({
            appid: index + 1,
            name: `Game ${index + 1}`,
            playtime_forever: 1,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${index + 1}/library_600x900.jpg`,
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${index + 1}/header.jpg`,
                icon: '',
                logo: '',
            },
        }))

        eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
            games: firstBatchGames,
            batchIndex: 0,
            totalBatches: 10,
        })

        await vi.waitFor(() => {
            expect(observedEventOrder).toContain('batch-ready-for-placement')
        }, { timeout: 5000, interval: 25 })

        expect(observedEventOrder).not.toContain('game-data-ready')
    })

})
