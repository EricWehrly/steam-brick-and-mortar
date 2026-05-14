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

        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => {
                if (appid === 1) {
                    return success.promise
                }
                return Promise.resolve('prefetched' as PrefetchResult)
            }),
        } as any

        const games = [
            {
                appid: 1,
                name: 'Has Art',
                artwork: { header: 'https://example.com/1-header.jpg', library: 'https://example.com/1.jpg' },
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

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(1)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(
            1,
            1,
            { header: 'https://example.com/1-header.jpg', library: 'https://example.com/1.jpg' },
            'Has Art'
        )
        expect(settled).toEqual([2, 0])

        success.resolve('prefetched')
        await success.promise
        await Promise.resolve()

        expect(settled.sort((a, b) => a - b)).toEqual([0, 1, 2])
        expect(mockWarn).toHaveBeenCalledTimes(0)

        coordinator.dispose()
    })

    it('passes both metadata hints to renderer when header and library exist', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const prefetch = createDeferred<PrefetchResult>()

        const renderer = {
            prefetchArtwork: vi.fn(() => prefetch.promise),
        } as any

        const richHeaderUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3741860/abc123/header.jpg?t=1234'
        const canonicalLibraryUrl = 'https://cdn.akamai.steamstatic.com/steam/apps/3741860/library_600x900.jpg'

        coordinator.prefetchBatch([
            {
                appid: 3741860,
                name: 'Vital Shell',
                artwork: {
                    header: richHeaderUrl,
                    library: canonicalLibraryUrl,
                },
            } as any,
        ], renderer)

        expect(renderer.prefetchArtwork).toHaveBeenCalledWith(3741860, {
            header: richHeaderUrl,
            library: canonicalLibraryUrl,
        }, 'Vital Shell')

        prefetch.resolve('prefetched')
        await prefetch.promise
        await Promise.resolve()

        coordinator.dispose()
    })

    it('does not retry inside coordinator when renderer reports permanent failure', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const prefetch = createDeferred<PrefetchResult>()
        const renderer = {
            prefetchArtwork: vi.fn(() => prefetch.promise),
        } as any

        const richHeaderUrl = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3741860/abc123/header.jpg?t=1234'
        const canonicalLibraryUrl = 'https://cdn.akamai.steamstatic.com/steam/apps/3741860/library_600x900.jpg'

        coordinator.prefetchBatch([
            {
                appid: 3741860,
                name: 'Vital Shell',
                artwork: {
                    header: richHeaderUrl,
                    library: canonicalLibraryUrl,
                },
            } as any,
        ], renderer)

        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(1, 3741860, {
            header: richHeaderUrl,
            library: canonicalLibraryUrl,
        }, 'Vital Shell')

        prefetch.resolve('permanent-failure')
        await prefetch.promise
        await Promise.resolve()

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(1)

        coordinator.dispose()
    })

    it('uses only library when header URL is not present', async () => {
        const coordinator = new ArtworkPrefetchCoordinator()
        const prefetch = createDeferred<PrefetchResult>()

        const renderer = {
            prefetchArtwork: vi.fn(() => prefetch.promise),
        } as any

        const canonicalLibraryUrl = 'https://cdn.akamai.steamstatic.com/steam/apps/777/library_600x900.jpg'

        coordinator.prefetchBatch([
            {
                appid: 777,
                name: 'Some Game',
                artwork: {
                    library: canonicalLibraryUrl,
                },
            } as any,
        ], renderer)

        expect(renderer.prefetchArtwork).toHaveBeenCalledWith(
            777,
            { library: canonicalLibraryUrl },
            'Some Game'
        )
        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(1)

        prefetch.resolve('prefetched')
        await prefetch.promise
        await Promise.resolve()

        coordinator.dispose()
    })
})
