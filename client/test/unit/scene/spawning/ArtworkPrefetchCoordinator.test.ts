import { describe, it, expect, beforeEach, vi } from 'vitest'

import { EventManager } from '../../../../src/core/EventManager'
import { ArtworkPrefetchCoordinator } from '../../../../src/scene/spawning/ArtworkPrefetchCoordinator'
import {
    GameEventTypes,
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
} from '../../../../src/types/InteractionEvents'

const { mockInfo, mockWarn } = vi.hoisted(() => ({
    mockInfo: vi.fn(),
    mockWarn: vi.fn(),
}))

vi.mock('../../../../src/utils/Logger', () => ({
    Logger: {
        createLogFunctions: vi.fn(() => ({
            info: mockInfo,
            warn: mockWarn,
            debug: vi.fn(),
            lifecycle: vi.fn(),
        })),
    },
}))

describe('ArtworkPrefetchCoordinator', () => {
    beforeEach(() => {
        EventManager.getInstance().removeAllListeners(GameEventTypes.ArtworkSettled)
        EventManager.getInstance().removeAllListeners(GameRenderEventTypes.ArtworkIntentSettled)
        vi.clearAllMocks()
    })

    it('logs expected fallback summary only once after artwork settled is emitted', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => {
                if (appid === 1) {
                    return Promise.resolve('prefetched')
                }
                if (appid === 2) {
                    return Promise.reject(new Error('404'))
                }
                return Promise.resolve('prefetched')
            }),
        } as any

        const games = [
            {
                appid: 1,
                name: 'Has Art',
                artwork: { library: 'https://example.com/1.jpg' },
            },
            {
                appid: 2,
                name: 'Broken Art',
                artwork: { library: 'https://example.com/2.jpg' },
            },
            {
                appid: 0,
                name: 'No Art',
                artwork: undefined,
            },
        ] as any[]

        const settled: number[] = []
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            (event: CustomEvent<ArtworkIntentSettledEvent>) => settled.push(event.detail.appid)
        )
        coordinator.prefetchBatch(games, renderer)
        await Promise.resolve()
        await Promise.resolve()

        expect(settled.sort((a, b) => a - b)).toEqual([0, 1, 2])

        EventManager.getInstance().emit(GameEventTypes.ArtworkSettled, {})
        EventManager.getInstance().emit(GameEventTypes.ArtworkSettled, {})

        expect(mockInfo).toHaveBeenCalledTimes(1)
        expect(mockInfo.mock.calls[0][0]).toContain('Broken Art')
        expect(mockInfo.mock.calls[0][0]).toContain('No Art')
    })

    it('does not log fallback summary when all prefetches succeed', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const renderer = {
            prefetchArtwork: vi.fn().mockResolvedValue('prefetched'),
        } as any

        coordinator.prefetchBatch([
            {
                appid: 1,
                name: 'Has Art',
                artwork: { library: 'https://example.com/1.jpg' },
            } as any,
        ], renderer)

        await Promise.resolve()
        coordinator.logExpectedFallbackSummary()

        expect(mockInfo).not.toHaveBeenCalled()
    })
})