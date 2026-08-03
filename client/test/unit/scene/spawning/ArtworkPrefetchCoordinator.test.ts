import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

import { EventManager } from '../../../../src/core/EventManager'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { ArtworkPrefetchCoordinator, type PrefetchResult } from '../../../../src/scene/spawning/ArtworkPrefetchCoordinator'
import {
    GameEventTypes,
    GameRenderEventTypes,
    type ArtworkIntentSettledEvent,
    type PlacementIntentReadyEvent,
} from '../../../../src/types/InteractionEvents'

const { mockWarn, mockInfo, mockDebug } = vi.hoisted(() => ({
    mockWarn: vi.fn(),
    mockInfo: vi.fn(),
    mockDebug: vi.fn(),
}))

vi.mock('../../../../src/utils/Logger', () => ({
    Logger: {
        createLogFunctions: vi.fn(() => ({
            info: mockInfo,
            warn: mockWarn,
            debug: mockDebug,
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
        EventManager.getInstance().removeAllListeners(GameRenderEventTypes.PlacementIntentReady)
        vi.clearAllMocks()
    })

    it('emits ArtworkIntentSettled once per game while delegating all prefetch decisions to renderer', async () => {
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

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(3)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(
            1,
            1,
            { header: 'https://example.com/1-header.jpg', library: 'https://example.com/1.jpg' },
            'Has Art'
        )
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(2, 2, undefined, 'Broken Art')
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(3, 0, undefined, 'No Art')

        await Promise.resolve()
        expect(settled.sort((a, b) => a - b)).toEqual([0, 2])

        success.resolve('prefetched')
        await success.promise
        await Promise.resolve()

        expect(settled.sort((a, b) => a - b)).toEqual([0, 1, 2])
        expect(mockWarn).toHaveBeenCalledTimes(0)

        coordinator.dispose()
    })

    it('caps concurrent dispatch and drains the queue as slots free up', async () => {
        const coordinator = new ArtworkPrefetchCoordinator({ maxConcurrentPrefetch: 2 })
        const deferreds = [0, 1, 2, 3].map(() => createDeferred<PrefetchResult>())

        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => deferreds[appid].promise),
        } as any

        const games = [0, 1, 2, 3].map((appid) => ({ appid, name: `Game ${appid}`, artwork: undefined }))

        coordinator.prefetchBatch(games as any[], renderer)

        // Only the cap's worth dispatch immediately; the rest wait in the queue.
        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(2)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(1, 0, undefined, 'Game 0')
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(2, 1, undefined, 'Game 1')

        deferreds[0].resolve('prefetched')
        await deferreds[0].promise
        await Promise.resolve()
        await Promise.resolve()

        // Freed slot picked up the next queued game.
        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(3)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(3, 2, undefined, 'Game 2')

        deferreds[1].resolve('prefetched')
        deferreds[2].resolve('prefetched')
        await Promise.all([deferreds[1].promise, deferreds[2].promise])
        await Promise.resolve()
        await Promise.resolve()

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(4)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(4, 3, undefined, 'Game 3')

        deferreds[3].resolve('prefetched')
        await deferreds[3].promise
        await Promise.resolve()

        coordinator.dispose()
    })

    it('lets a queued game with a known PlacementIntentReady position jump ahead of unpositioned games', async () => {
        const camera = new THREE.PerspectiveCamera()
        camera.position.set(0, 0, 0)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        const coordinator = new ArtworkPrefetchCoordinator({ maxConcurrentPrefetch: 1 })
        const deferreds = new Map<number, ReturnType<typeof createDeferred<PrefetchResult>>>(
            [0, 1, 2].map((appid) => [appid, createDeferred<PrefetchResult>()])
        )

        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => deferreds.get(appid)!.promise),
        } as any

        const games = [0, 1, 2].map((appid) => ({ appid, name: `Game ${appid}`, artwork: undefined }))

        coordinator.prefetchBatch(games as any[], renderer)

        // Cap of 1: only appid 0 dispatches immediately, 1 and 2 wait in the queue.
        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(1)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(1, 0, undefined, 'Game 0')

        // appid 2 is placed far from the camera, appid 1 is placed right next to it.
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(GameRenderEventTypes.PlacementIntentReady, {
            appid: 2,
            game: games[2] as any,
            position: new THREE.Vector3(100, 0, 0),
            rotation: new THREE.Quaternion(),
        })
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(GameRenderEventTypes.PlacementIntentReady, {
            appid: 1,
            game: games[1] as any,
            position: new THREE.Vector3(1, 0, 0),
            rotation: new THREE.Quaternion(),
        })

        deferreds.get(0)!.resolve('prefetched')
        await deferreds.get(0)!.promise
        await Promise.resolve()
        await Promise.resolve()

        // appid 1 (nearest) jumps ahead of appid 2, despite appid 2 being enqueued first.
        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(2)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(2, 1, undefined, 'Game 1')

        deferreds.get(1)!.resolve('prefetched')
        await deferreds.get(1)!.promise
        await Promise.resolve()
        await Promise.resolve()

        expect(renderer.prefetchArtwork).toHaveBeenCalledTimes(3)
        expect(renderer.prefetchArtwork).toHaveBeenNthCalledWith(3, 2, undefined, 'Game 2')

        deferreds.get(2)!.resolve('prefetched')
        await deferreds.get(2)!.promise
        await Promise.resolve()

        coordinator.dispose()
    })

    it('logs a scheduling summary on ArtworkSettled reflecting how many dispatches were distance-priority vs FIFO/background', async () => {
        const camera = new THREE.PerspectiveCamera()
        camera.position.set(0, 0, 0)
        DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })

        const coordinator = new ArtworkPrefetchCoordinator({ maxConcurrentPrefetch: 1 })
        const deferreds = new Map<number, ReturnType<typeof createDeferred<PrefetchResult>>>(
            [0, 1, 2].map((appid) => [appid, createDeferred<PrefetchResult>()])
        )
        const renderer = {
            prefetchArtwork: vi.fn((appid: number) => deferreds.get(appid)!.promise),
        } as any
        const games = [0, 1, 2].map((appid) => ({ appid, name: `Game ${appid}`, artwork: undefined }))

        coordinator.prefetchBatch(games as any[], renderer)
        // appid 0 dispatches with no known position yet - background/FIFO pick.

        EventManager.getInstance().emit<PlacementIntentReadyEvent>(GameRenderEventTypes.PlacementIntentReady, {
            appid: 1, game: games[1] as any, position: new THREE.Vector3(1, 0, 0), rotation: new THREE.Quaternion(),
        })
        EventManager.getInstance().emit<PlacementIntentReadyEvent>(GameRenderEventTypes.PlacementIntentReady, {
            appid: 2, game: games[2] as any, position: new THREE.Vector3(2, 0, 0), rotation: new THREE.Quaternion(),
        })

        deferreds.get(0)!.resolve('prefetched')
        await deferreds.get(0)!.promise
        await Promise.resolve()
        await Promise.resolve()
        // appid 1 dispatches next - its position is already known, so this is a distance pick.

        deferreds.get(1)!.resolve('prefetched')
        await deferreds.get(1)!.promise
        await Promise.resolve()
        await Promise.resolve()
        // appid 2 dispatches last, also with a known position - another distance pick.

        deferreds.get(2)!.resolve('prefetched')
        await deferreds.get(2)!.promise
        await Promise.resolve()

        EventManager.getInstance().emit(GameEventTypes.ArtworkSettled, {})

        expect(mockInfo).toHaveBeenCalledWith(
            expect.stringContaining('Prefetch scheduling: 2/3 dispatched by distance-priority, 1/3 by FIFO/background')
        )

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

    it('does not retry inside coordinator when renderer reports skipped', async () => {
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

        prefetch.resolve('skipped')
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
