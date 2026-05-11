import { describe, it, expect, beforeEach, vi } from 'vitest'

import { EventManager } from '../../../../src/core/EventManager'
import { ArtworkPrefetchCoordinator, type PrefetchResult } from '../../../../src/scene/spawning/ArtworkPrefetchCoordinator'
import {
    GameEventTypes,
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
} from '../../../../src/types/InteractionEvents'

const { mockWarn } = vi.hoisted(() => ({
    mockWarn: vi.fn(),
}))

vi.mock('../../../../src/utils/Logger', () => ({
    Logger: {
        createLogFunctions: vi.fn(() => ({
            info: vi.fn(),
            warn: mockWarn,
            debug: vi.fn(),
            lifecycle: vi.fn(),
        })),
    },
}))

describe('ArtworkPrefetchCoordinator', () => {
    const createDeferred = <T,>() => {
        let resolve!: (value: T | PromiseLike<T>) => void
        let reject!: (reason?: unknown) => void
        const promise = new Promise<T>((res, rej) => {
            resolve = res
            reject = rej
        })
        return { promise, resolve, reject }
    }

    beforeEach(() => {
        EventManager.getInstance().removeAllListeners(GameEventTypes.ArtworkSettled)
        EventManager.getInstance().removeAllListeners(GameRenderEventTypes.ArtworkIntentSettled)
        vi.clearAllMocks()
    })

    it('emits ArtworkIntentSettled once per game across success, fetch failure, and no-art cases', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const success = createDeferred<PrefetchResult>()
        const failure = createDeferred<PrefetchResult>()

        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => {
                if (appid === 1) {
                    return success.promise
                }
                if (appid === 2) {
                    return failure.promise
                }
                return Promise.resolve('prefetched' as PrefetchResult)
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
                artwork: undefined,
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

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(2)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(1, 1, 'https://example.com/1.jpg', 'Has Art')
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(2, 2, 'https://cdn.akamai.steamstatic.com/steam/apps/2/library_600x900.jpg', 'Broken Art')
        expect(settled).toEqual([0])

        success.resolve('prefetched')
        await Promise.resolve()
        expect(settled).toEqual([0, 1])

        failure.reject(new Error('404'))
        await failure.promise.catch(() => undefined)
        await Promise.resolve()

        expect(settled.sort((a, b) => a - b)).toEqual([0, 1, 2])
        expect(mockWarn).toHaveBeenCalledTimes(1)

        coordinator.dispose()
    })

    it('uses provider-selected first URL when library artwork is missing', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const prefetch = createDeferred<PrefetchResult>()

        const renderer = {
            prefetchArtwork: vi.fn(() => prefetch.promise),
        } as any

        const settled: number[] = []
        EventManager.getInstance().registerEventHandler(
            GameRenderEventTypes.ArtworkIntentSettled,
            (event: CustomEvent<ArtworkIntentSettledEvent>) => settled.push(event.detail.appid)
        )

        coordinator.prefetchBatch([
            {
                appid: 7,
                name: 'Header Candidate',
                artwork: undefined,
            } as any,
        ], renderer)

        expect(renderer.prefetchArtwork).toHaveBeenCalledWith(
            7,
            'https://cdn.akamai.steamstatic.com/steam/apps/7/library_600x900.jpg',
            'Header Candidate'
        )
        expect(settled).toEqual([])

        prefetch.resolve('prefetched')
        await Promise.resolve()

        expect(settled).toEqual([7])
        expect(mockWarn).not.toHaveBeenCalled()

        coordinator.dispose()
    })
})