/**
 * Unit Tests for LodGameArtworkRenderer
 * 
 * Tests:
 * - Initialization with texture arrays
 * - Instance creation and management
 * - LOD level switching (with lazy HIGH handling)
 * - GPU update batching via onFrame
 * - Spatial prewarming integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { 
    LodGameArtworkRenderer,
    LOD_LEVEL,
    type LodGameArtworkRendererConfig,
    type LodTextureArrays
} from '../../../../src/scene/game-box/instancing/LodGameArtworkRenderer'
import { RenderLoopRegistry } from '../../../../src/scene/RenderLoopRegistry'

// Mock RenderLoopRegistry
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
        setTextureArray: vi.fn(),
        registerGame: vi.fn(),
        requestHighTexture: vi.fn().mockReturnValue(-1),
        isLoaded: vi.fn().mockReturnValue(false),
        flushToGpu: vi.fn().mockReturnValue(false),
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

describe('LodGameArtworkRenderer', () => {
    let renderer: LodGameArtworkRenderer
    let mockScene: THREE.Scene
    let mockTextureArrays: LodTextureArrays
    let mockRenderLoopRegistry: { register: ReturnType<typeof vi.fn>; unregister: ReturnType<typeof vi.fn> }

    const defaultConfig: LodGameArtworkRendererConfig = {
        maxInstances: 100,
        boxWidth: 0.2,
        boxHeight: 0.3,
        boxDepth: 0.1
    }

    function createMockTextureArrays(): LodTextureArrays {
        const highData = new Uint8Array(300 * 450 * 64 * 4)
        const midData = new Uint8Array(150 * 225 * 100 * 4)
        
        return {
            high: new THREE.DataArrayTexture(highData, 300, 450, 64),
            mid: new THREE.DataArrayTexture(midData, 150, 225, 100)
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        
        mockScene = new THREE.Scene()
        mockTextureArrays = createMockTextureArrays()
        
        mockRenderLoopRegistry = {
            register: vi.fn(),
            unregister: vi.fn()
        }
        vi.mocked(RenderLoopRegistry.getInstance).mockReturnValue(mockRenderLoopRegistry as unknown as RenderLoopRegistry)
    })

    afterEach(() => {
        renderer?.dispose()
        mockTextureArrays.high.dispose()
        mockTextureArrays.mid.dispose()
    })

    describe('Construction', () => {
        it('should construct with default configuration', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            expect(renderer).toBeDefined()
            expect(renderer.isReady()).toBe(false)
        })

        it('should not be ready before initialization', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            expect(renderer.isReady()).toBe(false)
            expect(renderer.getMesh()).toBeNull()
        })

        it('should default to MID LOD when lazyHighTextures is true', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: true
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            const instanceIndex = renderer.addInstance(
                new THREE.Vector3(0, 0, 0),
                0,
                'Test Game'
            )
            
            const instance = renderer.getInstance(instanceIndex)
            expect(instance?.lodLevel).toBe(LOD_LEVEL.MID)
        })

        it('should default to HIGH LOD when lazyHighTextures is false', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: false,
                defaultLod: LOD_LEVEL.HIGH
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            const instanceIndex = renderer.addInstance(
                new THREE.Vector3(0, 0, 0),
                0,
                'Test Game'
            )
            
            const instance = renderer.getInstance(instanceIndex)
            expect(instance?.lodLevel).toBe(LOD_LEVEL.HIGH)
        })
    })

    describe('Initialization', () => {
        it('should create instanced mesh when initialized', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(renderer.isReady()).toBe(true)
            expect(renderer.getMesh()).toBeInstanceOf(THREE.InstancedMesh)
        })

        it('should add mesh to scene', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            const addSpy = vi.spyOn(mockScene, 'add')
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(addSpy).toHaveBeenCalledWith(expect.any(THREE.InstancedMesh))
        })

        it('should register for render loop', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(mockRenderLoopRegistry.register).toHaveBeenCalledWith(
                'LodGameArtworkRenderer',
                expect.any(Function)
            )
        })

        it('should not initialize twice', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            renderer.initialize(mockTextureArrays, mockScene)
            renderer.initialize(mockTextureArrays, mockScene)
            
            // Should only register once
            expect(mockRenderLoopRegistry.register).toHaveBeenCalledTimes(1)
        })

        it('should initialize HIGH texture cache when lazyHighTextures is true', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: true
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(renderer.getHighTextureCache()).not.toBeNull()
        })

        it('should not initialize HIGH texture cache when lazyHighTextures is false', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: false
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(renderer.getHighTextureCache()).toBeNull()
        })
    })

    describe('Instance Management', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('should add instance and return index', () => {
            const instanceIndex = renderer.addInstance(
                new THREE.Vector3(1, 2, 3),
                0,
                'Test Game'
            )
            
            expect(instanceIndex).toBe(0)
            expect(renderer.getInstanceCount()).toBe(1)
        })

        it('should track instance data', () => {
            const position = new THREE.Vector3(1, 2, 3)
            const instanceIndex = renderer.addInstance(position, 5, 'Test Game')
            
            const data = renderer.getInstance(instanceIndex)
            
            expect(data).toBeDefined()
            expect(data?.textureIndex).toBe(5)
            expect(data?.gameName).toBe('Test Game')
            expect(data?.position.x).toBe(1)
            expect(data?.position.y).toBe(2)
            expect(data?.position.z).toBe(3)
        })

        it('should return -1 when at capacity', () => {
            const smallRenderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                maxInstances: 2
            })
            smallRenderer.initialize(mockTextureArrays, mockScene)
            
            expect(smallRenderer.addInstance(new THREE.Vector3(), 0, 'Game 1')).toBe(0)
            expect(smallRenderer.addInstance(new THREE.Vector3(), 1, 'Game 2')).toBe(1)
            expect(smallRenderer.addInstance(new THREE.Vector3(), 2, 'Game 3')).toBe(-1)
            
            smallRenderer.dispose()
        })

        it('should return -1 when not initialized', () => {
            const uninitRenderer = new LodGameArtworkRenderer(defaultConfig)
            
            const index = uninitRenderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            expect(index).toBe(-1)
        })

        it('should return all instances', () => {
            renderer.addInstance(new THREE.Vector3(0, 0, 0), 0, 'Game 1')
            renderer.addInstance(new THREE.Vector3(1, 0, 0), 1, 'Game 2')
            renderer.addInstance(new THREE.Vector3(2, 0, 0), 2, 'Game 3')
            
            const all = renderer.getAllInstances()
            
            expect(all.size).toBe(3)
        })

        it('should report max instances', () => {
            expect(renderer.getMaxInstances()).toBe(100)
        })
    })

    describe('LOD Management', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: false,
                defaultLod: LOD_LEVEL.MID
            })
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('should set instance LOD', () => {
            const instanceIndex = renderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            const success = renderer.setInstanceLod(instanceIndex, LOD_LEVEL.HIGH)
            
            expect(success).toBe(true)
            expect(renderer.getInstance(instanceIndex)?.lodLevel).toBe(LOD_LEVEL.HIGH)
        })

        it('should fail for invalid instance index', () => {
            expect(renderer.setInstanceLod(-1, LOD_LEVEL.HIGH)).toBe(false)
            expect(renderer.setInstanceLod(999, LOD_LEVEL.HIGH)).toBe(false)
        })

        it('should set global LOD for all instances', () => {
            renderer.addInstance(new THREE.Vector3(0, 0, 0), 0, 'Game 1')
            renderer.addInstance(new THREE.Vector3(1, 0, 0), 1, 'Game 2')
            renderer.addInstance(new THREE.Vector3(2, 0, 0), 2, 'Game 3')
            
            renderer.setGlobalLod(LOD_LEVEL.HIGH)
            
            expect(renderer.getInstance(0)?.lodLevel).toBe(LOD_LEVEL.HIGH)
            expect(renderer.getInstance(1)?.lodLevel).toBe(LOD_LEVEL.HIGH)
            expect(renderer.getInstance(2)?.lodLevel).toBe(LOD_LEVEL.HIGH)
        })

        it('should update HIGH texture slot', () => {
            const instanceIndex = renderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            const success = renderer.setInstanceHighSlot(instanceIndex, 5)
            
            expect(success).toBe(true)
            expect(renderer.getInstance(instanceIndex)?.highTextureSlot).toBe(5)
        })
    })

    describe('Lazy HIGH Textures', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: true
            })
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('should check if HIGH texture is loaded', () => {
            renderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            // Mock returns false for isLoaded
            expect(renderer.isHighTextureLoaded(0)).toBe(false)
        })

        it('should start/stop prewarming', () => {
            // Just ensure no errors - actual behavior tested via mocks
            renderer.startPrewarming()
            renderer.stopPrewarming()
        })
    })

    describe('GPU Updates', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                gpuUpdateInterval: 5
            })
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('should flush to GPU manually', () => {
            renderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            // Should not throw
            renderer.flushToGpu()
        })
    })

    describe('Disposal', () => {
        it('should dispose all resources', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
            renderer.addInstance(new THREE.Vector3(), 0, 'Test')
            
            renderer.dispose()
            
            expect(mockRenderLoopRegistry.unregister).toHaveBeenCalledWith('LodGameArtworkRenderer')
        })

        it('should unregister from render loop', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
            
            renderer.dispose()
            
            expect(mockRenderLoopRegistry.unregister).toHaveBeenCalled()
        })

        it('should remove mesh from scene', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
            
            const mesh = renderer.getMesh()!
            const removeFromParentSpy = vi.spyOn(mesh, 'removeFromParent')
            
            renderer.dispose()
            
            expect(removeFromParentSpy).toHaveBeenCalled()
        })
    })
})
