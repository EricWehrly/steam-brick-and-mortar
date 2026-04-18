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
import { GameArtworkProvider } from '../../../../src/scene/game-box/instancing/GameArtworkProvider'

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
        it('does not short-circuit on non-permanent known failures', async () => {
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
                'https://example.com/art.jpg',
                123
            )

            expect(provider.getArtwork).toHaveBeenCalled()
        })

        it('short-circuits on permanent failures', async () => {
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
                'https://example.com/art.jpg',
                999
            )

            expect(result.success).toBe(false)
            expect(provider.getArtwork).not.toHaveBeenCalled()
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
            expect(() => orchestrator.clearFailureCache()).not.toThrow()
        })

        it('should dispose without throwing', () => {
            expect(() => orchestrator.dispose()).not.toThrow()
        })
    })
})
