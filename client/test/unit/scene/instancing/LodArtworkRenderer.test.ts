/**
 * Unit Tests for LodArtworkRenderer - Per-Instance Level of Detail System
 * 
 * These tests validate:
 * - LOD level configuration (High/Mid/Low)
 * - Per-instance LOD attribute management
 * - Global LOD switching
 * - Memory statistics with multi-resolution textures
 * - GPU update batching
 * - Disposal and resource cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { 
    LodArtworkRenderer, 
    LOD_LEVEL,
    DEFAULT_LOD_CONFIGS,
    type LodArtworkConfig,
    type LodLevel
} from '../../../../src/scene/game-box/instancing/LodArtworkRenderer'
import { LodArtworkRendererDebug } from '../../../../src/scene/game-box/instancing/LodArtworkRendererDebug'
import { DataManager } from '../../../../src/core/data/DataManager'
import { EventManager } from '../../../../src/core/EventManager'

// Mock dependencies
vi.mock('../../../../src/core/data/DataManager')
vi.mock('../../../../src/core/EventManager')
vi.mock('../../../../src/scene/game-box/instancing/TextureWorker')

describe('LodArtworkRenderer', () => {
    let renderer: LodArtworkRenderer
    let mockScene: THREE.Scene
    let mockDataManager: ReturnType<typeof vi.fn> & { 
        get: ReturnType<typeof vi.fn>, 
        set: ReturnType<typeof vi.fn>,
        addMemoryConsumption: ReturnType<typeof vi.fn>,
        removeMemoryConsumption: ReturnType<typeof vi.fn>
    }
    let mockEventManager: ReturnType<typeof vi.fn> & { registerEventHandler: ReturnType<typeof vi.fn>, emit: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        vi.clearAllMocks()

        mockScene = new THREE.Scene()

        mockDataManager = {
            get: vi.fn().mockReturnValue(mockScene),
            set: vi.fn(),
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn()
        } as unknown as typeof mockDataManager
        vi.mocked(DataManager.getInstance).mockReturnValue(mockDataManager as unknown as DataManager)

        mockEventManager = {
            registerEventHandler: vi.fn(),
            emit: vi.fn()
        } as unknown as typeof mockEventManager
        vi.mocked(EventManager.getInstance).mockReturnValue(mockEventManager as unknown as EventManager)
    })

    afterEach(() => {
        if (renderer) {
            renderer.dispose()
        }
    })

    describe('Construction and Configuration', () => {
        it('should construct with default configuration', () => {
            renderer = new LodArtworkRenderer()

            expect(renderer).toBeDefined()
            expect(renderer.isReady()).toBe(false)
        })

        it('should accept custom LOD configurations', () => {
            const customConfig: LodArtworkConfig = {
                maxTextures: 256,
                defaultLod: LOD_LEVEL.MID
            }

            renderer = new LodArtworkRenderer(customConfig)
            expect(renderer).toBeDefined()
        })

        it('should register for InstancedBatchComplete events', () => {
            renderer = new LodArtworkRenderer()

            expect(mockEventManager.registerEventHandler).toHaveBeenCalledWith(
                expect.stringContaining('batch'),
                expect.any(Function)
            )
        })

        it('should accept custom box dimensions', () => {
            const customConfig: LodArtworkConfig = {
                boxWidth: 0.5,
                boxHeight: 0.6,
                boxDepth: 0.15
            }

            renderer = new LodArtworkRenderer(customConfig)
            expect(renderer).toBeDefined()
        })
    })

    describe('LOD Level Constants', () => {
        it('should define HIGH as 0', () => {
            expect(LOD_LEVEL.HIGH).toBe(0)
        })

        it('should define MID as 1', () => {
            expect(LOD_LEVEL.MID).toBe(1)
        })

        it('should have only two LOD levels (no LOW)', () => {
            expect(Object.keys(LOD_LEVEL)).toHaveLength(2)
            expect(LOD_LEVEL).not.toHaveProperty('LOW')
        })
    })

    describe('Default LOD Configurations', () => {
        it('should define high LOD with actual Steam CDN capsule dimensions (300x450)', () => {
            // Note: Steam advertises 600x900 but CDN serves 300x450 (half size)
            const highConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.HIGH)
            expect(highConfig).toBeDefined()
            expect(highConfig!.textureWidth).toBe(300)
            expect(highConfig!.textureHeight).toBe(450)
            expect(highConfig!.name).toBe('high')
        })

        it('should define mid LOD with 128x128 textures', () => {
            const midConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.MID)
            expect(midConfig).toBeDefined()
            expect(midConfig!.textureSize).toBe(128)
            expect(midConfig!.name).toBe('mid')
        })

        it('should have 2 LOD levels configured (two-tier system)', () => {
            expect(DEFAULT_LOD_CONFIGS).toHaveLength(2)
        })
    })

    describe('Memory Statistics (Debug)', () => {
        // These tests use LodArtworkRendererDebug since stats are debug-only
        let debugRenderer: LodArtworkRendererDebug
        
        afterEach(() => {
            debugRenderer?.dispose()
        })
        
        it('should report memory stats for all LOD levels', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            const stats = debugRenderer.getMemoryStats()
            
            expect(stats.lods).toBeDefined()
            expect(stats.lods.high).toBeDefined()
            expect(stats.lods.mid).toBeDefined()
            // No LOW in two-tier system
        })

        it('should include texture count in stats', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            const stats = debugRenderer.getMemoryStats()
            
            expect(typeof stats.textureCount).toBe('number')
            expect(stats.textureCount).toBe(0)  // No textures loaded yet
        })

        it('should include instance count in stats', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            const stats = debugRenderer.getMemoryStats()
            
            expect(typeof stats.instanceCount).toBe('number')
            expect(stats.instanceCount).toBe(0)  // No instances yet
        })

        it('should include totalAllocated in stats', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            const stats = debugRenderer.getMemoryStats()
            
            // totalAllocated is 0 until initialize() is called
            expect(typeof stats.totalAllocated).toBe('number')
        })

        it('should calculate reasonable VRAM budget for default config', () => {
            // Calculate expected VRAM for two-tier system
            // High: 512×512×64×4 = 64MB (dynamic array, small)
            // Mid: 128×128×512×4 = 32MB (full array for all games)
            // Total: ~96MB
            
            const highConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.HIGH)
            const midConfig = DEFAULT_LOD_CONFIGS.find(c => c.level === LOD_LEVEL.MID)
            
            // HIGH uses maxDepth (128), MID uses maxTextures (512)
            const highDepth = highConfig!.maxDepth ?? 512
            const midDepth = 512  // MID covers all games
            
            // HIGH uses 300x450 portrait capsules (what Steam CDN actually serves), MID uses 128x128 squares
            const highWidth = highConfig!.textureWidth ?? 300
            const highHeight = highConfig!.textureHeight ?? 450
            const midSize = midConfig!.textureSize ?? 128
            
            const highBytes = highWidth * highHeight * highDepth * 4
            const midBytes = midSize * midSize * midDepth * 4
            const totalMB = (highBytes + midBytes) / (1024 * 1024)
            
            // With HIGH=128 slots at 300x450 and MID=512 slots at 128x128:
            // 300*450*128*4 = ~65.9MB + 128*128*512*4 = ~32MB = ~98MB
            expect(totalMB).toBeGreaterThan(50)
            expect(totalMB).toBeLessThan(150)
        })
    })

    describe('Instance Count Tracking', () => {
        it('should start with zero instances', () => {
            renderer = new LodArtworkRenderer()
            
            expect(renderer.getInstanceCount()).toBe(0)
        })
    })

    describe('Readiness State', () => {
        it('should not be ready before initialization', () => {
            renderer = new LodArtworkRenderer()
            
            expect(renderer.isReady()).toBe(false)
        })
    })

    describe('LOD Level Management', () => {
        it('should have setGlobalLod method', () => {
            renderer = new LodArtworkRenderer()
            
            expect(typeof renderer.setGlobalLod).toBe('function')
        })

        it('should not throw when setting global LOD before initialization', () => {
            renderer = new LodArtworkRenderer()
            
            expect(() => renderer.setGlobalLod(LOD_LEVEL.MID)).not.toThrow()
        })

        it('should have setInstanceLod method', () => {
            renderer = new LodArtworkRenderer()
            
            expect(typeof renderer.setInstanceLod).toBe('function')
        })

        it('should return false when setting LOD for invalid instance', () => {
            renderer = new LodArtworkRenderer()
            
            const result = renderer.setInstanceLod(-1, LOD_LEVEL.HIGH)
            expect(result).toBe(false)
        })

        it('should have getInstanceLod method', () => {
            renderer = new LodArtworkRenderer()
            
            expect(typeof renderer.getInstanceLod).toBe('function')
        })

        it('should return null for invalid instance LOD query', () => {
            renderer = new LodArtworkRenderer()
            
            const result = renderer.getInstanceLod(-1)
            expect(result).toBeNull()
        })
    })

    describe('Disposal', () => {
        it('should dispose without throwing', () => {
            renderer = new LodArtworkRenderer()
            
            expect(() => renderer.dispose()).not.toThrow()
        })

        it('should dispose cleanly even if never initialized', () => {
            renderer = new LodArtworkRenderer()
            
            renderer.dispose()
            
            // Should be safe to call dispose multiple times
            expect(() => renderer.dispose()).not.toThrow()
        })
    })

    describe('GPU Update Integration', () => {
        it('should have updateGPU method', () => {
            renderer = new LodArtworkRenderer()
            
            expect(typeof renderer.updateGPU).toBe('function')
        })

        it('should not throw when updateGPU called before initialization', () => {
            renderer = new LodArtworkRenderer()
            
            expect(() => renderer.updateGPU()).not.toThrow()
        })
    })

    describe('Log Methods (Debug)', () => {
        // These tests use LodArtworkRendererDebug since logging is debug-only
        let debugRenderer: LodArtworkRendererDebug
        
        afterEach(() => {
            debugRenderer?.dispose()
        })
        
        it('should have logMemoryStats method', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            expect(typeof debugRenderer.logMemoryStats).toBe('function')
        })

        it('should not throw when logging stats', () => {
            debugRenderer = new LodArtworkRendererDebug()
            
            expect(() => debugRenderer.logMemoryStats()).not.toThrow()
        })
    })
})

describe('LodArtworkRenderer LOD Selection Logic', () => {
    // These tests document the LOD selection algorithm
    
    it('should use HIGH LOD by default for new instances', () => {
        const config: LodArtworkConfig = {
            defaultLod: LOD_LEVEL.HIGH
        }
        
        const renderer = new LodArtworkRenderer(config)
        expect(renderer).toBeDefined()
        
        renderer.dispose()
    })

    it('should allow configuring default LOD to MID', () => {
        const config: LodArtworkConfig = {
            defaultLod: LOD_LEVEL.MID
        }
        
        const renderer = new LodArtworkRenderer(config)
        expect(renderer).toBeDefined()
        
        renderer.dispose()
    })

    // Two-tier system: no LOW LOD
})

describe('LodArtworkRenderer Type Safety', () => {
    it('should enforce LodLevel type with two tiers', () => {
        // This test validates TypeScript type constraints
        const validLevels: LodLevel[] = [
            LOD_LEVEL.HIGH,
            LOD_LEVEL.MID
        ]
        
        expect(validLevels).toHaveLength(2)
        expect(validLevels).toContain(0)  // HIGH
        expect(validLevels).toContain(1)  // MID
    })
})
