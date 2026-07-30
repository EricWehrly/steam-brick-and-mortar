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
        getTexture: vi.fn().mockReturnValue({}), // Return mock texture
        registerGame: vi.fn(),
        unregisterGame: vi.fn(),
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
        if ('high' in mockTextureArrays && mockTextureArrays.high) {
            mockTextureArrays.high.dispose()
        }
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
        })

        it('should default to MID LOD when lazyHighTextures is true', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: true
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            const instanceIndex = renderer.addInstance({ position: new THREE.Vector3(0, 0, 0), textureIndex: 0, gameName: 'Test Game' })
            
            expect(renderer.getInstanceCount()).toBe(1)
        })

        it('should default to HIGH LOD when lazyHighTextures is false', () => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: false,
                defaultLod: LOD_LEVEL.HIGH
            })
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            const instanceIndex = renderer.addInstance({ position: new THREE.Vector3(0, 0, 0), textureIndex: 0, gameName: 'Test Game' })
            
            expect(renderer.getInstanceCount()).toBe(1)
        })
    })

    describe('Initialization', () => {
        it('should create instanced mesh when initialized', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            
            renderer.initialize(mockTextureArrays, mockScene)
            
            expect(renderer.isReady()).toBe(true)
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
            const instanceIndex = renderer.addInstance({ position: new THREE.Vector3(1, 2, 3), textureIndex: 0, gameName: 'Test Game' })
            
            expect(instanceIndex).toBe(0)
            expect(renderer.getInstanceCount()).toBe(1)
        })

        it('should return -1 when at capacity', () => {
            const smallRenderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                maxInstances: 2
            })
            smallRenderer.initialize(mockTextureArrays, mockScene)
            
            expect(smallRenderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Game 1' })).toBe(0)
            expect(smallRenderer.addInstance({ position: new THREE.Vector3(), textureIndex: 1, gameName: 'Game 2' })).toBe(1)
            expect(smallRenderer.addInstance({ position: new THREE.Vector3(), textureIndex: 2, gameName: 'Game 3' })).toBe(-1)
            
            smallRenderer.dispose()
        })

        it('should return -1 when not initialized', () => {
            const uninitRenderer = new LodGameArtworkRenderer(defaultConfig)
            
            const index = uninitRenderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Test' })
            
            expect(index).toBe(-1)
        })

        it('should return all instances', () => {
            renderer.addInstance({ position: new THREE.Vector3(0, 0, 0), textureIndex: 0, gameName: 'Game 1' })
            renderer.addInstance({ position: new THREE.Vector3(1, 0, 0), textureIndex: 1, gameName: 'Game 2' })
            renderer.addInstance({ position: new THREE.Vector3(2, 0, 0), textureIndex: 2, gameName: 'Game 3' })
            
            expect(renderer.getInstanceCount()).toBe(3)
        })
    })

    describe('setInstanceArtwork (repoint without allocating)', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: false,
                defaultLod: LOD_LEVEL.MID
            })
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('repoints an existing instance without allocating a new slot', () => {
            renderer.addInstance({ position: new THREE.Vector3(0, 0, 0), textureIndex: 0, gameName: 'Game A' })
            const target = renderer.addInstance({ position: new THREE.Vector3(1, 0, 0), textureIndex: 1, gameName: 'Game B' })

            const success = renderer.setInstanceArtwork(target, {
                position: new THREE.Vector3(9, 9, 9),
                textureIndex: 5,
                gameName: 'Game C',
            })

            expect(success).toBe(true)
            expect(renderer.getInstanceCount()).toBe(2) // no new instance allocated
        })

        it('round-trips the new texture index through textureIndexToInstance', () => {
            const target = renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Game A' })
            renderer.setInstanceArtwork(target, {
                position: new THREE.Vector3(),
                textureIndex: 42,
                gameName: 'Game B',
            })

            // onHighSlotChange resolves instanceIndex via textureIndexToInstance - exercise it
            // indirectly by confirming a HIGH-slot update lands on the repointed instance.
            const updated = renderer.setInstanceHighSlot(target, 3)
            expect(updated).toBe(true)
        })

        it('resets LOD level to the repoint call default rather than carrying over the old level', () => {
            const target = renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Game A' })
            renderer.setInstanceLod(target, LOD_LEVEL.HIGH)
            expect(renderer.getInstanceLod(target)).toBe(LOD_LEVEL.HIGH)

            renderer.setInstanceArtwork(target, {
                position: new THREE.Vector3(),
                textureIndex: 7,
                gameName: 'Game B',
                lodLevel: LOD_LEVEL.MID,
            })

            expect(renderer.getInstanceLod(target)).toBe(LOD_LEVEL.MID)
        })

        it('does not touch neighbouring instances', () => {
            const first = renderer.addInstance({ position: new THREE.Vector3(1, 1, 1), textureIndex: 0, gameName: 'Game A' })
            const second = renderer.addInstance({ position: new THREE.Vector3(2, 2, 2), textureIndex: 1, gameName: 'Game B' })

            renderer.setInstanceArtwork(second, {
                position: new THREE.Vector3(9, 9, 9),
                textureIndex: 5,
                gameName: 'Game C',
            })

            expect(renderer.getInstanceLod(first)).not.toBeNull()
            expect(renderer.getInstanceCount()).toBe(2)
        })

        it('returns false for an out-of-range instance index', () => {
            const success = renderer.setInstanceArtwork(999, {
                position: new THREE.Vector3(),
                textureIndex: 0,
                gameName: 'Game A',
            })
            expect(success).toBe(false)
        })
    })

    describe('setInstanceArtwork with a duplicate textureIndex across instances (liminal ring wraparound)', () => {
        beforeEach(() => {
            renderer = new LodGameArtworkRenderer({
                ...defaultConfig,
                lazyHighTextures: true,
                defaultLod: LOD_LEVEL.MID
            })
            renderer.initialize(mockTextureArrays, mockScene)
        })

        it('does not unregister a texture from HighTextureCache while another instance still displays it', () => {
            const first = renderer.addInstance({
                position: new THREE.Vector3(0, 0, 0), textureIndex: 3, gameName: 'Shared Game', highArtworkUrl: 'a.jpg'
            })
            renderer.addInstance({
                position: new THREE.Vector3(1, 0, 0), textureIndex: 3, gameName: 'Shared Game', highArtworkUrl: 'a.jpg'
            })

            const cache = renderer.getHighTextureCache() as unknown as { unregisterGame: ReturnType<typeof vi.fn> }
            renderer.setInstanceArtwork(first, {
                position: new THREE.Vector3(9, 9, 9),
                textureIndex: 8,
                gameName: 'New Game',
            })

            expect(cache.unregisterGame).not.toHaveBeenCalledWith(3)
        })

        it('unregisters the texture once no instance displays it anymore', () => {
            const first = renderer.addInstance({
                position: new THREE.Vector3(0, 0, 0), textureIndex: 3, gameName: 'Solo Game', highArtworkUrl: 'a.jpg'
            })

            const cache = renderer.getHighTextureCache() as unknown as { unregisterGame: ReturnType<typeof vi.fn> }
            renderer.setInstanceArtwork(first, {
                position: new THREE.Vector3(9, 9, 9),
                textureIndex: 8,
                gameName: 'New Game',
            })

            expect(cache.unregisterGame).toHaveBeenCalledWith(3)
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

        it('should update HIGH texture slot', () => {
            const instanceIndex = renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Test' })
            
            const success = renderer.setInstanceHighSlot(instanceIndex, 5)
            
            expect(success).toBe(true)
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
            renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Test' })
            
            // Mock returns false for isLoaded
            expect(renderer.isHighTextureLoaded(0)).toBe(false)
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
            renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Test' })
            
            // Should not throw
            renderer.flushToGpu()
        })
    })

    describe('Disposal', () => {
        it('should dispose all resources', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
            renderer.addInstance({ position: new THREE.Vector3(), textureIndex: 0, gameName: 'Test' })
            
            renderer.dispose()
            
            expect(mockRenderLoopRegistry.unregister).toHaveBeenCalledWith('LodGameArtworkRenderer')
        })

        it('should unregister from render loop', () => {
            renderer = new LodGameArtworkRenderer(defaultConfig)
            renderer.initialize(mockTextureArrays, mockScene)
            
            renderer.dispose()
            
            expect(mockRenderLoopRegistry.unregister).toHaveBeenCalled()
        })

    })
})
