import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataManager } from '../../../src/core/data'
import { EventManager } from '../../../src/core/EventManager'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import { SteamApiClient, type SteamGame } from '../../../src/steam/SteamApiClient'
import {
    SteamEventTypes,
    GameEventTypes,
} from '../../../src/types/InteractionEvents'

/**
 * loadDemoGames() now sources the anonymous store from SteamApiClient.getDemoGames()
 * (AppDetailsCache entries with is_free === true and undesirable_for_demo unset, enriched via
 * GamesLoader.buildEnhancedGame) rather than a hardcoded fixture - see
 * docs/plans/f2p-artwork-bake-plan.md. Mocked at that boundary instead of the removed
 * demo-games.ts module.
 */
function mockDemoGames(count: number): SteamGame[] {
    const games: SteamGame[] = []
    for (let index = 0; index < count; index++) {
        const appid = 100000 + index
        games.push({
            appid,
            name: `Demo Game ${index + 1}`,
            playtime_forever: 0,
            img_icon_url: '',
            img_logo_url: '',
            artwork: { icon: '', logo: '', header: '', library: '' },
            genres: [{ id: '37', description: 'Free to Play' }],
        })
    }
    return games
}

describe('SteamIntegration demo load ordering', () => {
    beforeEach(() => {
        DataManager.getInstance().clear()
        EventManager.getInstance().removeAllListeners()
        SteamIntegration.dispose()
        vi.clearAllMocks()
        vi.spyOn(SteamApiClient.getInstance(), 'getDemoGames').mockResolvedValue(mockDemoGames(36))
    })

    it('emits readiness before batch events and yields between multi-batch emissions', async () => {
        const integration = SteamIntegration.getInstance()
        const eventManager = EventManager.getInstance()
        const originalEmit = eventManager.emit.bind(eventManager)
        const emitSpy = vi.spyOn(eventManager, 'emit').mockImplementation((...args) => {
            return originalEmit(...args)
        })
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
        const baselineSetTimeoutCalls = setTimeoutSpy.mock.calls.length

        await integration['loadDemoGames']()

        const emittedTypes = emitSpy.mock.calls.map(([eventType]) => eventType)
        const manifestIndex = emittedTypes.indexOf(SteamEventTypes.LibraryManifestReady)
        const gameDataIndex = emittedTypes.indexOf(GameEventTypes.GameDataReady)
        const firstBatchIndex = emittedTypes.indexOf(SteamEventTypes.GamesBatchReady)

        expect(manifestIndex).toBeGreaterThan(-1)
        expect(gameDataIndex).toBeGreaterThan(-1)
        expect(firstBatchIndex).toBeGreaterThan(-1)
        expect(manifestIndex).toBeLessThan(firstBatchIndex)
        expect(gameDataIndex).toBeLessThan(firstBatchIndex)

        const batchCalls = emitSpy.mock.calls.filter(([eventType]) => eventType === SteamEventTypes.GamesBatchReady)
        expect(batchCalls).toHaveLength(2)

        const firstBatch = batchCalls[0][1] as { batchIndex: number; totalBatches: number; games: unknown[] }
        const secondBatch = batchCalls[1][1] as { batchIndex: number; totalBatches: number; games: unknown[] }

        expect(firstBatch.batchIndex).toBe(0)
        expect(firstBatch.totalBatches).toBe(2)
        expect(firstBatch.games).toHaveLength(18)

        expect(secondBatch.batchIndex).toBe(1)
        expect(secondBatch.totalBatches).toBe(2)
        expect(secondBatch.games).toHaveLength(18)

        const newSetTimeoutCalls = setTimeoutSpy.mock.calls.slice(baselineSetTimeoutCalls)
        const zeroDelayYields = newSetTimeoutCalls.filter(([, delay]) => delay === 0)

        expect(zeroDelayYields.length).toBeGreaterThanOrEqual(1)
    })
})
