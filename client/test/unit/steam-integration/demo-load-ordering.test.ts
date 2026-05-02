import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DataManager } from '../../../src/core/data'
import { EventManager } from '../../../src/core/EventManager'
import { SteamIntegration } from '../../../src/steam-integration/SteamIntegration'
import {
    SteamEventTypes,
    GameEventTypes,
} from '../../../src/types/InteractionEvents'

vi.mock('../../../src/steam/fixtures/demo-games', () => {
    const games = Array.from({ length: 36 }, (_, index) => {
        const appid = 100000 + index
        return {
            appid,
            name: `Demo Game ${index + 1}`,
            playtime_forever: 1000 - index,
            img_icon_url: '',
            img_logo_url: '',
            artwork: {
                icon: '',
                logo: '',
                header: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
            },
            genres: [{ id: '37', description: 'Free to Play' }],
        }
    })

    return {
        ANONYMOUS_STORE_USER: {
            steamid: '',
            vanity_url: 'anonymous',
            game_count: games.length,
            retrieved_at: '2026-01-01T00:00:00.000Z',
            games,
        },
    }
})

describe('SteamIntegration demo load ordering', () => {
    beforeEach(() => {
        DataManager.getInstance().clear()
        EventManager.getInstance().removeAllListeners()
        vi.clearAllMocks()
    })

    it('emits readiness before batch events and yields between multi-batch emissions', async () => {
        const integration = new SteamIntegration()
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
