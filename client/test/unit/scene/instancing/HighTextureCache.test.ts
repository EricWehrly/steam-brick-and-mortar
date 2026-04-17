import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import * as THREE from 'three'
import { HighTextureCache, HighTextureState } from '../../../../src/scene/game-box/instancing/HighTextureCache'
import { PixelDataCache } from '../../../../src/scene/game-box/instancing/PixelDataCache'
import { TextureWorker } from '../../../../src/scene/game-box/instancing/TextureWorker'

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
        cache.registerGame(0, 'Game 0', 'http://test/0.jpg')
        
        // Initial request should be a MISS
        const slot = cache.requestHighTexture(0)
        expect(slot).toBe(-1)
        expect(cache.getState(0)).toBe(HighTextureState.LOADING)
    })

    it('should assign slots correctly when loading finishes', async () => {
        cache.registerGame(0, 'Game A', 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 'http://test/B.jpg')

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
        cache.registerGame(0, 'Game A', 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 'http://test/B.jpg')
        cache.registerGame(2, 'Game C', 'http://test/C.jpg')

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
        cache.registerGame(0, 'Game A', 'http://test/A.jpg')
        cache.registerGame(1, 'Game B', 'http://test/B.jpg')
        cache.registerGame(2, 'Game C', 'http://test/C.jpg')

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
})