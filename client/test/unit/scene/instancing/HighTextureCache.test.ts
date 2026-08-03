import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import * as THREE from 'three'
import { HighTextureCache, HighTextureState } from '../../../../src/scene/game-box/instancing/HighTextureCache'
import { PixelDataCache } from '../../../../src/scene/game-box/instancing/PixelDataCache'
import { TextureWorker } from '../../../../src/scene/game-box/instancing/TextureWorker'
import { GameArtworkProvider } from '../../../../src/scene/game-box/instancing/GameArtworkProvider'
import { AppDetailsCache } from '../../../../src/steam/cache/AppDetailsCache'

const { fetchPixelsFromLocalDiskMock } = vi.hoisted(() => ({
    fetchPixelsFromLocalDiskMock: vi.fn(),
}))

// Mock dependencies
vi.mock('../../../../src/scene/game-box/instancing/PixelDataCache', () => ({
    PixelDataCache: {
        getInstance: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
                width: 600,
                height: 900,
                pixelData: new Uint8ClampedArray(600 * 900 * 4)
            }),
            put: vi.fn().mockResolvedValue(true)
        })
    }
}))

vi.mock('../../../../src/scene/game-box/instancing/TextureWorker', () => ({
    TextureWorker: class {
        fetchAndProcessWithOptions = vi.fn().mockResolvedValue({
            width: 600,
            height: 900,
            imageData: new Uint8ClampedArray(600 * 900 * 4)
        })
        dispose = vi.fn()
    }
}))

// Local-disk art always misses by default (mirrors "nothing registered for this appId") so the
// pre-existing pixel-cache/network tests below are unaffected — only the dedicated tests further
// down override this to exercise the local-disk-first path.
vi.mock('../../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: {
        getInstance: vi.fn().mockReturnValue({
            fetchPixelsFromLocalDisk: fetchPixelsFromLocalDiskMock,
        }),
    },
}))

vi.mock('../../../../src/steam/cache/AppDetailsCache', () => ({
    AppDetailsCache: {
        getDeadArtworkPaths: vi.fn().mockResolvedValue(new Set()),
        markArtworkPathDead: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('../../../../src/utils/FrameBudgetScheduler', () => ({
    FrameBudgetScheduler: {
        getInstance: vi.fn().mockReturnValue({
            tryExecuteOrSchedule: vi.fn((task) => {
                task()
                return true
            }),
            schedule: vi.fn((task) => task())
        })
    }
}))

// We need to advance time manually to test LRU logic
const setTime = (time: number) => {
    vi.spyOn(window.performance, 'now').mockReturnValue(time)
}

describe('HighTextureCache LRU', () => {
    let cache: HighTextureCache
    let mockTextureWorker: any
    let onSlotChange: Mock

    beforeEach(() => {
        vi.clearAllMocks()
        fetchPixelsFromLocalDiskMock.mockReset().mockResolvedValue(null)
        vi.mocked(AppDetailsCache.getDeadArtworkPaths).mockReset().mockResolvedValue(new Set())
        vi.mocked(AppDetailsCache.markArtworkPathDead).mockReset().mockResolvedValue(undefined)

        // Mock performance.now to start at 1000
        setTime(1000)

        // Create a tiny cache (2 slots) for testing LRU
        cache = new HighTextureCache({
            totalSlots: 2,
            textureWidth: 600,
            textureHeight: 900,
            maxConcurrentLoads: 2
        })

        onSlotChange = vi.fn()
        cache.setSlotChangeCallback(onSlotChange)
        
        // Setup mock GPU array (mocking the internal DataArrayTexture)
        const mockArray = cache.getTexture()
        mockArray.addLayerUpdate = vi.fn()

        // Get access to the mock worker instance
        // @ts-expect-error accessing private property for test verification
        mockTextureWorker = cache.textureWorker
    })

    afterEach(() => {
        cache.dispose()
        vi.restoreAllMocks()
    })

    it('should return -1 when cache miss and start loading', () => {
        cache.registerGame(0, 'Game 0', 100, 'http://test/0.jpg')
        
        // Initial request should be a MISS
        const slot = cache.requestHighTexture(0)
        expect(slot).toBe(-1)
        expect(cache.getState(0)).toBe(HighTextureState.LOADING)
    })

    it('should assign slots correctly when loading finishes', async () => {
        cache.registerGame(0, 'Game A', 100, 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 101, 'http://test/B.jpg')

        // Request both
        cache.requestHighTexture(0)
        cache.requestHighTexture(1)

        // Wait for loads to finish
        // @ts-expect-error accessing private property for test verification
        await Promise.all(Array.from(cache.loadingPromises.values()))
        // Awaited twice because the loadingPromise doesn't cover the scheduler callback which copies data
        // But since we're mocking FrameBudgetScheduler.getInstance() ... Wait, we didn't mock it!
        // We'll just force the scheduler to run synchronously by letting vitest resolve all microtasks
        await new Promise(resolve => setTimeout(resolve, 50)) // Give the worker / scheduler time

        // Both should now be loaded into slots 0 and 1
        expect(cache.getState(0)).toBe(HighTextureState.LOADED)
        expect(cache.getState(1)).toBe(HighTextureState.LOADED)
        
        expect(cache.getHighSlot(0)).toBe(0)
        expect(cache.getHighSlot(1)).toBe(1)
    })

    it('should evict LRU texture when slots are full', async () => {
        cache.registerGame(0, 'Game A', 100, 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 101, 'http://test/B.jpg')
        cache.registerGame(2, 'Game C', 102, 'http://test/C.jpg')

        // Load Game A
        setTime(1000)
        cache.requestHighTexture(0)
        await new Promise(r => setTimeout(r, 10))
        
        // Load Game B
        setTime(2000)
        cache.requestHighTexture(1)
        await new Promise(r => setTimeout(r, 10))

        // Cache is now full:
        // Slot 0: Game A (last accessed: 1000) -> This is LRU
        // Slot 1: Game B (last accessed: 2000)

        expect(cache.getState(0)).toBe(HighTextureState.LOADED)
        expect(cache.getHighSlot(0)).toBe(0)

        // Load Game C (Requires eviction)
        setTime(3000)
        cache.requestHighTexture(2)
        await new Promise(r => setTimeout(r, 10))

        // Game A should have been evicted to make room for C
        expect(cache.getState(0)).toBe(HighTextureState.EMPTY)
        expect(cache.getHighSlot(0)).toBe(-1)
        
        // Callback should have fired to notify orchestrator that A lost its slot
        expect(onSlotChange).toHaveBeenCalledWith(0, -1)

        // Game C should be loaded in slot 0 now
        expect(cache.getState(2)).toBe(HighTextureState.LOADED)
        expect(cache.getHighSlot(2)).toBe(0)
    })

    it('should update LRU access time on hit', async () => {
        cache.registerGame(0, 'Game A', 100, 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 101, 'http://test/B.jpg')
        cache.registerGame(2, 'Game C', 102, 'http://test/C.jpg')

        setTime(1000)
        cache.requestHighTexture(0)
        await new Promise(r => setTimeout(r, 10))
        
        setTime(2000)
        cache.requestHighTexture(1)
        await new Promise(r => setTimeout(r, 10))

        // Game A is currently LRU (1000 vs 2000).
        // Let's request Game A again to bump its access time.
        setTime(3000)
        const hitSlot = cache.requestHighTexture(0)
        expect(hitSlot).toBe(0) // Cache HIT!

        // Now Game B is LRU (2000 vs 3000).
        
        // Request Game C (needs eviction)
        setTime(4000)
        cache.requestHighTexture(2)
        await new Promise(r => setTimeout(r, 10))

        // Game B should be the one evicted, NOT Game A
        expect(cache.getState(1)).toBe(HighTextureState.EMPTY)
        expect(cache.getHighSlot(1)).toBe(-1)

        expect(cache.getState(0)).toBe(HighTextureState.LOADED) // A survived
        expect(cache.getState(2)).toBe(HighTextureState.LOADED) // C loaded over B
    })

    describe('unregisterGame', () => {
        it('clears the game entry so a reused gameIndex re-registers instead of no-op-ing', async () => {
            // registerGame() already no-ops if the gameIndex is still registered from before -
            // this is what LodArtworkOrchestrator.reconcileForLibraryReload relies on to avoid a
            // removed game's HIGH registration leaking into whatever new game reuses its slot.
            cache.registerGame(0, 'Old Game', 100, 'http://test/old.jpg')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 10))
            expect(cache.getState(0)).toBe(HighTextureState.LOADED)

            cache.unregisterGame(0)

            expect(cache.getState(0)).toBe(HighTextureState.EMPTY)
            cache.registerGame(0, 'New Game', 100, 'http://test/new.jpg')
            expect(cache.requestHighTexture(0)).toBe(-1)
            expect(cache.getState(0)).toBe(HighTextureState.LOADING)
        })
    })

    describe('local-disk-first HIGH loading', () => {
        it('loads from GameArtworkProvider.fetchPixelsFromLocalDisk instead of the network when local art is available', async () => {
            fetchPixelsFromLocalDiskMock.mockResolvedValue({
                pixels: new Uint8ClampedArray(600 * 900 * 4).fill(42),
                width: 600,
                height: 900,
                fromCache: false,
            })

            cache.registerGame(0, 'Local Game', 2062430, 'https://cdn.akamai.steamstatic.com/steam/apps/2062430/library_600x900.jpg')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 10))

            expect(cache.getState(0)).toBe(HighTextureState.LOADED)
            expect(fetchPixelsFromLocalDiskMock).toHaveBeenCalledWith(2062430, 'library', 600, 900)

            const pixelCache = PixelDataCache.getInstance()
            expect(pixelCache.get).not.toHaveBeenCalled()
            expect(mockTextureWorker.fetchAndProcessWithOptions).not.toHaveBeenCalled()
        })

        it('falls through to the network pixel-cache path when local disk has nothing for this game', async () => {
            fetchPixelsFromLocalDiskMock.mockResolvedValue(null)

            cache.registerGame(0, 'Network Game', 500, 'http://test/network.jpg')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 10))

            expect(cache.getState(0)).toBe(HighTextureState.LOADED)
            expect(fetchPixelsFromLocalDiskMock).toHaveBeenCalledWith(500, 'library', 600, 900)

            const pixelCache = PixelDataCache.getInstance()
            expect(pixelCache.get).toHaveBeenCalledWith('http://test/network.jpg', 600, 900)
        })
    })

    describe('dead-path skip for background caching', () => {
        it('skips the network fetch and marks the game failed for a known-dead URL, without ever calling fetchAndProcessWithOptions', async () => {
            fetchPixelsFromLocalDiskMock.mockResolvedValue(null)
            const pixelCache = PixelDataCache.getInstance()
            vi.mocked(pixelCache.get).mockResolvedValueOnce(null) // pixel cache MISS -> defer to background caching
            vi.mocked(AppDetailsCache.getDeadArtworkPaths).mockResolvedValueOnce(
                new Set(['http://test/dead.jpg'])
            )

            cache.registerGame(0, 'Dead Game', 999, 'http://test/dead.jpg')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 20))

            expect(cache.getState(0)).toBe(HighTextureState.FAILED)
            expect(mockTextureWorker.fetchAndProcessWithOptions).not.toHaveBeenCalled()
        })

        it('strips the ?t= cache-buster before checking dead paths and before the pixel-cache key', async () => {
            fetchPixelsFromLocalDiskMock.mockResolvedValue(null)
            const pixelCache = PixelDataCache.getInstance()
            vi.mocked(pixelCache.get).mockResolvedValueOnce(null)
            vi.mocked(AppDetailsCache.getDeadArtworkPaths).mockResolvedValueOnce(
                new Set(['http://test/dead.jpg'])
            )

            cache.registerGame(0, 'Dead Game', 999, 'http://test/dead.jpg?t=1234567890')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 20))

            expect(pixelCache.get).toHaveBeenCalledWith('http://test/dead.jpg', 600, 900)
            expect(cache.getState(0)).toBe(HighTextureState.FAILED)
            expect(mockTextureWorker.fetchAndProcessWithOptions).not.toHaveBeenCalled()
        })

        it('marks a genuinely failed background fetch as dead for next time', async () => {
            fetchPixelsFromLocalDiskMock.mockResolvedValue(null)
            const pixelCache = PixelDataCache.getInstance()
            vi.mocked(pixelCache.get).mockResolvedValueOnce(null)
            mockTextureWorker.fetchAndProcessWithOptions.mockRejectedValueOnce(new Error('HTTP 404: Not Found'))

            cache.registerGame(0, 'Failing Game', 999, 'http://test/will-fail.jpg')
            cache.requestHighTexture(0)
            await new Promise(r => setTimeout(r, 20))

            expect(cache.getState(0)).toBe(HighTextureState.FAILED)
            expect(AppDetailsCache.markArtworkPathDead).toHaveBeenCalledWith(999, 'http://test/will-fail.jpg')
        })
    })
})