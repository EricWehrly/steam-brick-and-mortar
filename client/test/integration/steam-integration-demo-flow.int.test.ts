import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventManager } from '../../src/core/EventManager'
import { DataManager } from '../../src/core/data'
import { BatchCoordinator } from '../../src/scene/batch/BatchCoordinator'
import { SteamIntegration } from '../../src/steam-integration/SteamIntegration'
import {
    SteamEventTypes,
    StorePropsEventTypes,
    type BatchReadyForPlacementEvent,
    type SteamLibraryManifestReadyEvent,
} from '../../src/types/InteractionEvents'

describe('SteamIntegration demo flow integration', () => {
    beforeEach(() => {
        DataManager.getInstance().clear()
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('drives BatchCoordinator with readiness emitted before placement batches', async () => {
        const eventManager = EventManager.getInstance()
        const integration = new SteamIntegration()
        const batchCoordinator = new (BatchCoordinator as any)()

        const sequence: string[] = []
        let manifestDetail: SteamLibraryManifestReadyEvent | null = null
        const placementBatches: BatchReadyForPlacementEvent[] = []

        eventManager.registerEventHandler(
            SteamEventTypes.LibraryManifestReady,
            (event: CustomEvent<SteamLibraryManifestReadyEvent>) => {
                sequence.push(SteamEventTypes.LibraryManifestReady)
                manifestDetail = event.detail
            }
        )

        eventManager.registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                sequence.push(StorePropsEventTypes.BatchReadyForPlacement)
                placementBatches.push(event.detail)
            }
        )

        await integration['loadDemoGames']()

        await vi.waitFor(() => {
            expect(placementBatches.length).toBeGreaterThan(0)
        }, { timeout: 5000, interval: 25 })

        expect(manifestDetail).not.toBeNull()
        expect(manifestDetail?.totalGames).toBeGreaterThan(0)

        const manifestIndex = sequence.indexOf(SteamEventTypes.LibraryManifestReady)
        const firstPlacementBatchIndex = sequence.indexOf(StorePropsEventTypes.BatchReadyForPlacement)
        expect(manifestIndex).toBeGreaterThan(-1)
        expect(firstPlacementBatchIndex).toBeGreaterThan(-1)
        expect(manifestIndex).toBeLessThan(firstPlacementBatchIndex)

        const firstBatch = placementBatches[0]
        expect(firstBatch.batchIndex).toBe(0)
        expect(firstBatch.totalBatches).toBeGreaterThan(0)
        expect(firstBatch.games.length).toBeGreaterThan(0)

        batchCoordinator.dispose?.()
    })
})
