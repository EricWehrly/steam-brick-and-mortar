/**
 * Unit Tests for LodArtworkOrchestrator
 * 
 * Tests:
 * - Tier name configuration consistency (prevents 'med' vs 'mid' mismatches)
 * - Integration between LodTextureArrayManager and orchestrator
 * - Basic construction and initialization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { 
    LodArtworkOrchestrator,
    DEFAULT_LOD_CONFIGS,
    LOD_LEVEL,
    LOD_TIER_NAME
} from '../../../../src/scene/game-box/instancing/LodArtworkOrchestrator'
import { DataManager } from '../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../src/core/data/DataTypes'
import { EventManager } from '../../../../src/core/EventManager'
import { GameEventTypes } from '../../../../src/types/InteractionEvents'
import { GameArtworkProvider } from '../../../../src/scene/game-box/instancing/GameArtworkProvider'
import { SteamArtworkStateManager } from '../../../../src/core/data/SteamArtworkStateManager'

// Mock DataManager
vi.mock('../../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: vi.fn().mockReturnValue({
            get: vi.fn(),
            set: vi.fn(),
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn()
        })
    }
}))

// Mock EventManager
vi.mock('../../../../src/core/EventManager', () => ({
    EventManager: {
        getInstance: vi.fn().mockReturnValue({
            registerEventHandler: vi.fn(),
            deregisterEventHandler: vi.fn(),
            unregisterEventHandler: vi.fn(),
            removeEventListener: vi.fn(),
            emit: vi.fn()
        })
    }
}))

// Mock GameArtworkProvider
vi.mock('../../../../src/scene/game-box/instancing/GameArtworkProvider', () => ({
    GameArtworkProvider: {
        getInstance: vi.fn().mockReturnValue({
            getArtwork: vi.fn(),
            isKnownFailure: vi.fn().mockReturnValue(false),
            isPermanentFailure: vi.fn().mockReturnValue(false),
            getFailureReason: vi.fn(),
            clearCaches: vi.fn()
        })
    }
}))

// Mock SteamArtworkStateManager so label gating can be driven deterministically
vi.mock('../../../../src/core/data/SteamArtworkStateManager', () => ({
    SteamArtworkStateManager: {
        getState: vi.fn(),
        setSelection: vi.fn(),
        clearSelection: vi.fn(),
    }
}))

// Mock RenderLoopRegistry (used by LodGameArtworkRenderer)
vi.mock('../../../../src/scene/RenderLoopRegistry', () => ({
    RenderLoopRegistry: {
        getInstance: vi.fn().mockReturnValue({
            register: vi.fn(),
            unregister: vi.fn()
        })
    }
}))

// Mock HighTextureCache
vi.mock('../../../../src/scene/game-box/instancing/HighTextureCache', () => ({
    HighTextureCache: vi.fn().mockImplementation(function() { return {
        setSlotChangeCallback: vi.fn(),
        getTexture: vi.fn().mockReturnValue({}), // Return mock texture
        registerGame: vi.fn(),
        requestHighTexture: vi.fn().mockReturnValue(-1),
        isLoaded: vi.fn().mockReturnValue(false),
        flushToGpu: vi.fn().mockReturnValue(false),
        evictAll: vi.fn().mockReturnValue(0),
        dispose: vi.fn()
    } })
}))

// Mock SpatialPrewarmingManager
vi.mock('../../../../src/scene/game-box/instancing/SpatialPrewarmingManager', () => ({
    SpatialPrewarmingManager: vi.fn().mockImplementation(function() { return {
        registerGamePosition: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        dispose: vi.fn()
    } })
}))

describe('LodArtworkOrchestrator', () => {
    let orchestrator: LodArtworkOrchestrator
    let mockDataManager: ReturnType<typeof createMockDataManager>

    function createMockDataManager() {
        return {
            get: vi.fn(),
            set: vi.fn(),
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn()
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockDataManager = createMockDataManager()
        vi.mocked(DataManager.getInstance).mockReturnValue(mockDataManager as unknown as DataManager)
    })

    afterEach(() => {
        orchestrator?.dispose()
    })

    describe('Tier Name Configuration', () => {
        /**
         * CRITICAL: This test ensures tier names use constants, not magic strings.
         * The bug was: someone used 'med' instead of 'mid', causing initialization to fail.
         * By using LOD_TIER_NAME constants, we get compile-time checking.
         */
        it('should use LOD_TIER_NAME constants for tier names (not magic strings)', () => {
            // Verify DEFAULT_LOD_CONFIGS uses the same values as LOD_TIER_NAME constants
            const configuredTierNames = DEFAULT_LOD_CONFIGS.map(config => config.name)
            
            // These should be the constant values
            expect(configuredTierNames).toContain(LOD_TIER_NAME.HIGH)
            expect(configuredTierNames).toContain(LOD_TIER_NAME.MID)
            
            // Verify the constants have the expected string values
            expect(LOD_TIER_NAME.HIGH).toBe('high')
            expect(LOD_TIER_NAME.MID).toBe('mid')
        })

        it('should have HIGH tier config with LOD_TIER_NAME.HIGH', () => {
            const highConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.HIGH)
            
            expect(highConfig).toBeDefined()
            expect(highConfig!.name).toBe(LOD_TIER_NAME.HIGH)
        })

        it('should have MID tier config with LOD_TIER_NAME.MID', () => {
            const midConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.MID)
            
            expect(midConfig).toBeDefined()
            expect(midConfig!.name).toBe(LOD_TIER_NAME.MID)
        })
        
        it('should reject misspelled tier names like "med"', () => {
            // This documents the bug we fixed - "med" != "mid"
            expect(LOD_TIER_NAME.MID).not.toBe('med')
            
            // Ensure none of our configs use the wrong spelling
            const configuredTierNames = DEFAULT_LOD_CONFIGS.map(config => config.name)
            expect(configuredTierNames).not.toContain('med')
        })
    })

    describe('Construction without scene', () => {
        it('should construct without throwing when MainScene is not available', () => {
            // DataManager returns null for MainScene - orchestrator should handle this
            mockDataManager.get.mockReturnValue(null)
            
            expect(() => {
                orchestrator = new LodArtworkOrchestrator()
            }).not.toThrow()
        })

        it('should register for batch complete events', () => {
            mockDataManager.get.mockReturnValue(null)
            
            orchestrator = new LodArtworkOrchestrator()
            
            expect(EventManager.getInstance().registerEventHandler).toHaveBeenCalled()
        })
    })

    describe('Construction with scene', () => {
        it('should initialize successfully when MainScene is available', () => {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            
            // This should NOT throw - if it does, we have a tier name mismatch
            expect(() => {
                orchestrator = new LodArtworkOrchestrator()
            }).not.toThrow()
        })

        it('should register artwork metadata with DataManager after initialization', () => {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            
            orchestrator = new LodArtworkOrchestrator()
            
            expect(mockDataManager.set).toHaveBeenCalledWith(
                DataKey.InstancedArtworkMetadata,
                expect.any(Map),
                expect.objectContaining({ domain: DataDomain.Renderer })
            )
        })
    })

    describe('Custom LOD configs', () => {
        it('should accept custom lodConfigs that use LOD_TIER_NAME constants', () => {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            
            // Custom configs MUST use LOD_TIER_NAME constants
            const customConfigs = [
                { level: LOD_LEVEL.HIGH, textureWidth: 200, textureHeight: 300, name: LOD_TIER_NAME.HIGH, maxDepth: 32 },
                { level: LOD_LEVEL.MID, textureWidth: 100, textureHeight: 150, name: LOD_TIER_NAME.MID }
            ]
            
            expect(() => {
                orchestrator = new LodArtworkOrchestrator({ lodConfigs: customConfigs })
            }).not.toThrow()
        })

        it('should fail initialization if custom configs use wrong tier names', () => {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            
            // WRONG: Using 'med' instead of LOD_TIER_NAME.MID - this should fail
            const badConfigs = [
                { level: LOD_LEVEL.HIGH, textureWidth: 200, textureHeight: 300, name: LOD_TIER_NAME.HIGH, maxDepth: 32 },
                { level: LOD_LEVEL.MID, textureWidth: 100, textureHeight: 150, name: 'med' }  // WRONG - not using constant!
            ]
            
            expect(() => {
                orchestrator = new LodArtworkOrchestrator({ lodConfigs: badConfigs })
            }).toThrow(/Failed to get texture array/)
        })
    })

    describe('Failure skip semantics', () => {
        it('short-circuits prefetch when label selection is cached', async () => {
            mockDataManager.get.mockReturnValue(null)
            orchestrator = new LodArtworkOrchestrator({ lazyHighTextures: true })

            const provider = GameArtworkProvider.getInstance() as unknown as {
                getArtwork: ReturnType<typeof vi.fn>
            }

            vi.mocked(SteamArtworkStateManager.getState).mockReturnValue({ selectedType: 'label' })

            const result = await orchestrator.prefetchArtwork(123, { library: 'https://example.com/art.jpg' }, 'Blocked Game')

            expect(result).toBe('skipped')
            expect(provider.getArtwork).not.toHaveBeenCalled()
        })

        it('short-circuits placement when label selection is cached', async () => {
            mockDataManager.get.mockReturnValue(null)
            orchestrator = new LodArtworkOrchestrator()

            const provider = GameArtworkProvider.getInstance() as unknown as {
                getArtwork: ReturnType<typeof vi.fn>
            }

            vi.mocked(SteamArtworkStateManager.getState).mockReturnValue({ selectedType: 'label' })

            const result = await orchestrator.setArtworkInstanceFromUrl(
                new THREE.Vector3(0, 0, 0),
                'Blocked Game',
                { library: 'https://example.com/art.jpg' },
                123
            )

            expect(result.success).toBe(false)
            expect(provider.getArtwork).not.toHaveBeenCalled()
        })

        it('does not short-circuit on non-permanent known failures', async () => {
            vi.mocked(SteamArtworkStateManager.getState).mockReturnValue(null)

            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            orchestrator = new LodArtworkOrchestrator({ lazyHighTextures: true })

            const provider = GameArtworkProvider.getInstance() as unknown as {
                isPermanentFailure: ReturnType<typeof vi.fn>
                getArtwork: ReturnType<typeof vi.fn>
            }

            provider.isPermanentFailure.mockReturnValue(false)
            provider.getArtwork.mockReturnValue({
                getPixelsAtSize: vi.fn().mockResolvedValue({ pixels: new Uint8ClampedArray(150 * 225 * 4), width: 150, height: 225 }),
                getUrl: vi.fn().mockReturnValue('https://example.com/art.jpg')
            })

            await orchestrator.setArtworkInstanceFromUrl(
                new THREE.Vector3(0, 0, 0),
                'Test Game',
                { library: 'https://example.com/art.jpg' },
                123
            )

            expect(provider.getArtwork).toHaveBeenCalled()
        })

        it('does not short-circuit on permanent failures', async () => {
            mockDataManager.get.mockReturnValue(null)
            orchestrator = new LodArtworkOrchestrator()

            const provider = GameArtworkProvider.getInstance() as unknown as {
                isPermanentFailure: ReturnType<typeof vi.fn>
                getArtwork: ReturnType<typeof vi.fn>
                getFailureReason: ReturnType<typeof vi.fn>
            }

            provider.isPermanentFailure.mockReturnValue(true)
            provider.getFailureReason.mockReturnValue('CORS')

            const result = await orchestrator.setArtworkInstanceFromUrl(
                new THREE.Vector3(0, 0, 0),
                'Blocked Game',
                { library: 'https://example.com/art.jpg' },
                999
            )

            expect(result.success).toBe(false)
            expect(provider.getArtwork).toHaveBeenCalled()
        })
    })

    describe('reconcileForLibraryReload', () => {
        function withScene(): THREE.Scene {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            return mockScene
        }

        function mockArtworkPixels(): ReturnType<typeof vi.fn> {
            const getPixelsAtSize = vi.fn().mockResolvedValue({
                pixels: new Uint8ClampedArray(150 * 225 * 4),
                width: 150,
                height: 225,
            })
            const provider = GameArtworkProvider.getInstance() as unknown as {
                getArtwork: ReturnType<typeof vi.fn>
            }
            provider.getArtwork.mockReturnValue({ getPixelsAtSize })
            return getPixelsAtSize
        }

        it('keeps a survivor\'s texture slot mapping - a repeat prefetch is a cache hit, no new fetch', async () => {
            withScene()
            const getPixelsAtSize = mockArtworkPixels()
            orchestrator = new LodArtworkOrchestrator()

            expect(await orchestrator.prefetchArtwork(100, undefined, 'Removed Game')).toBe('prefetched')
            expect(await orchestrator.prefetchArtwork(200, undefined, 'Kept Game')).toBe('prefetched')
            // Eager (non-lazy) mode fetches both MID and HIGH tiers per game - 2 games x 2 tiers.
            const callsBeforeReconcile = getPixelsAtSize.mock.calls.length
            expect(callsBeforeReconcile).toBe(4)

            orchestrator.reconcileForLibraryReload(['Removed Game'])

            // Survivor still resolves instantly from the existing mapping - no new fetch.
            expect(await orchestrator.prefetchArtwork(200, undefined, 'Kept Game')).toBe('cached')
            expect(getPixelsAtSize).toHaveBeenCalledTimes(callsBeforeReconcile)
            expect(orchestrator.placeInstance(200, 'Kept Game', new THREE.Vector3())).toBeGreaterThanOrEqual(0)
        })

        it('clears the removed game\'s mapping so it can no longer be placed', async () => {
            withScene()
            mockArtworkPixels()
            orchestrator = new LodArtworkOrchestrator()

            expect(await orchestrator.prefetchArtwork(100, undefined, 'Removed Game')).toBe('prefetched')
            orchestrator.reconcileForLibraryReload(['Removed Game'])

            expect(orchestrator.placeInstance(100, 'Removed Game', new THREE.Vector3())).toBe(-1)
        })

        it('does not rewind slot allocation - a newly-added game gets a fresh slot beyond existing ones', async () => {
            withScene()
            mockArtworkPixels()
            orchestrator = new LodArtworkOrchestrator()

            await orchestrator.prefetchArtwork(100, undefined, 'Removed Game')
            await orchestrator.prefetchArtwork(200, undefined, 'Kept Game')
            orchestrator.reconcileForLibraryReload(['Removed Game'])

            // A brand-new game still prefetches and places successfully after reconcile.
            expect(await orchestrator.prefetchArtwork(300, undefined, 'New Game')).toBe('prefetched')
            expect(orchestrator.placeInstance(300, 'New Game', new THREE.Vector3())).toBeGreaterThanOrEqual(0)
        })

        it('does not throw when a removed game was never actually prefetched', () => {
            withScene()
            orchestrator = new LodArtworkOrchestrator()
            expect(() => orchestrator.reconcileForLibraryReload(['Never Prefetched'])).not.toThrow()
        })
    })

    describe('setInstanceArtwork', () => {
        function withScene(): THREE.Scene {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            return mockScene
        }

        function mockArtworkPixels(): void {
            const getPixelsAtSize = vi.fn().mockResolvedValue({
                pixels: new Uint8ClampedArray(150 * 225 * 4),
                width: 150,
                height: 225,
            })
            const provider = GameArtworkProvider.getInstance() as unknown as {
                getArtwork: ReturnType<typeof vi.fn>
            }
            provider.getArtwork.mockReturnValue({ getPixelsAtSize })
        }

        it('repoints an already-placed instance to a different prefetched game', async () => {
            withScene()
            mockArtworkPixels()
            orchestrator = new LodArtworkOrchestrator()

            await orchestrator.prefetchArtwork(100, undefined, 'Game A')
            await orchestrator.prefetchArtwork(200, undefined, 'Game B')
            const instanceIndex = orchestrator.placeInstance(100, 'Game A', new THREE.Vector3())
            expect(instanceIndex).toBeGreaterThanOrEqual(0)

            const success = orchestrator.setInstanceArtwork(instanceIndex, 200, 'Game B', new THREE.Vector3(1, 2, 3))
            expect(success).toBe(true)
        })

        it('fails when the target game has not been prefetched', async () => {
            withScene()
            mockArtworkPixels()
            orchestrator = new LodArtworkOrchestrator()

            await orchestrator.prefetchArtwork(100, undefined, 'Game A')
            const instanceIndex = orchestrator.placeInstance(100, 'Game A', new THREE.Vector3())

            const success = orchestrator.setInstanceArtwork(instanceIndex, 999, 'Never Prefetched', new THREE.Vector3())
            expect(success).toBe(false)
        })
    })

    describe('MID atlas compaction timing (concurrency-cap regression)', () => {
        function withScene(): THREE.Scene {
            const mockScene = new THREE.Scene()
            mockDataManager.get.mockImplementation((key: DataKey) => {
                if (key === DataKey.MainScene) return mockScene
                return null
            })
            return mockScene
        }

        function findRegisteredHandler(eventType: string): () => void {
            const eventManager = EventManager.getInstance() as unknown as {
                registerEventHandler: ReturnType<typeof vi.fn>
            }
            const entry = eventManager.registerEventHandler.mock.calls.find(
                ([registeredType]) => registeredType === eventType
            )
            expect(entry).toBeDefined()
            return entry![1] as () => void
        }

        /**
         * Regression for the bug this exact fix addresses: compactMidTier() used to run
         * unconditionally the instant AllBatchesComplete fired, trimming the MID array down to
         * whatever slot count had been allocated so far. That was harmless when prefetchBatch()
         * fired every game immediately (AllBatchesComplete always arrived after every game had
         * already claimed a slot) - but ArtworkPrefetchCoordinator's concurrency-capped queue
         * (Root Cause B) means most of the library is still queued, not yet dispatched, when
         * AllBatchesComplete fires. Compacting then permanently locked the atlas at a tiny
         * fraction of the library, and every later-dispatched game failed allocateSlot() forever.
         */
        it('lets a game dispatched while others are still in flight claim a slot, even after AllBatchesComplete fires mid-flight', async () => {
            withScene()
            orchestrator = new LodArtworkOrchestrator({ maxTextures: 5, maxInstances: 5, lazyHighTextures: true })

            const provider = GameArtworkProvider.getInstance() as unknown as {
                getArtwork: ReturnType<typeof vi.fn>
            }

            let resolveFirst!: (result: { pixels: Uint8ClampedArray; width: number; height: number }) => void
            let resolveSecond!: (result: { pixels: Uint8ClampedArray; width: number; height: number }) => void
            const firstPixels = new Promise<{ pixels: Uint8ClampedArray; width: number; height: number }>((r) => { resolveFirst = r })
            const secondPixels = new Promise<{ pixels: Uint8ClampedArray; width: number; height: number }>((r) => { resolveSecond = r })

            provider.getArtwork
                .mockReturnValueOnce({ getPixelsAtSize: vi.fn(() => firstPixels) })
                .mockReturnValueOnce({ getPixelsAtSize: vi.fn(() => secondPixels) })

            // Two games dispatched (slots 0 and 1 allocated), neither resolved yet - the normal
            // state of the world under a concurrency cap greater than 1.
            const gameAPromise = orchestrator.prefetchArtwork(1, undefined, 'Game A')
            const gameBPromise = orchestrator.prefetchArtwork(2, undefined, 'Game B')

            // Data-loading finishes while both are still in flight.
            findRegisteredHandler(GameEventTypes.AllBatchesComplete)()

            resolveFirst({ pixels: new Uint8ClampedArray(150 * 225 * 4), width: 150, height: 225 })
            expect(await gameAPromise).toBe('prefetched')

            // Game B is still in flight (inFlightArtworkCount === 1) - the atlas must not have
            // compacted yet. A third game, dispatched now (as the coordinator's queue would
            // immediately do once a concurrency slot frees up), must still get a real slot.
            provider.getArtwork.mockReturnValueOnce({
                getPixelsAtSize: vi.fn().mockResolvedValue({ pixels: new Uint8ClampedArray(150 * 225 * 4), width: 150, height: 225 }),
            })
            expect(await orchestrator.prefetchArtwork(3, undefined, 'Game C')).toBe('prefetched')

            resolveSecond({ pixels: new Uint8ClampedArray(150 * 225 * 4), width: 150, height: 225 })
            expect(await gameBPromise).toBe('prefetched')
        })
    })

    describe('Basic API', () => {
        beforeEach(() => {
            mockDataManager.get.mockReturnValue(null)  // No scene
            orchestrator = new LodArtworkOrchestrator()
        })

        it('should report instance count', () => {
            expect(orchestrator.getInstanceCount()).toBe(0)
        })

        it('should clear failure cache', () => {
            expect(() => (orchestrator as any).clearFailureCache()).not.toThrow()
        })

        it('should dispose without throwing', () => {
            expect(() => orchestrator.dispose()).not.toThrow()
        })
    })
})
