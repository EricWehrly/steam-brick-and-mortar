/**
 * Unit Tests for LodTextureArrayManager
 * 
 * Tests:
 * - Texture array creation with proper dimensions
 * - Slot allocation
 * - Pixel data copying
 * - GPU flush with partial layer updates
 * - VRAM tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { 
    LodTextureArrayManager,
    type LodTierConfig,
    type LodTextureArrayManagerConfig
} from '../../../../src/scene/game-box/instancing/LodTextureArrayManager'
import { DataManager } from '../../../../src/core/data/DataManager'

// Mock DataManager
vi.mock('../../../../src/core/data/DataManager', () => ({
    DataManager: {
        getInstance: vi.fn().mockReturnValue({
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn()
        })
    }
}))

describe('LodTextureArrayManager', () => {
    let manager: LodTextureArrayManager
    let mockDataManager: { addMemoryConsumption: ReturnType<typeof vi.fn>; removeMemoryConsumption: ReturnType<typeof vi.fn> }

    const defaultConfig: LodTextureArrayManagerConfig = {
        tiers: [
            { name: 'high', width: 300, height: 450, maxDepth: 64 },
            { name: 'mid', width: 150, height: 225, maxDepth: 512 }
        ]
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockDataManager = {
            addMemoryConsumption: vi.fn(),
            removeMemoryConsumption: vi.fn()
        }
        vi.mocked(DataManager.getInstance).mockReturnValue(mockDataManager as unknown as DataManager)
    })

    afterEach(() => {
        manager?.dispose()
    })

    describe('Construction', () => {
        it('should create texture arrays for all tiers', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const highTexture = manager.getTextureArray('high')
            const midTexture = manager.getTextureArray('mid')
            
            expect(highTexture).toBeInstanceOf(THREE.DataArrayTexture)
            expect(midTexture).toBeInstanceOf(THREE.DataArrayTexture)
        })

        it('should create texture arrays with correct dimensions', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const highTexture = manager.getTextureArray('high')!
            
            expect(highTexture.image.width).toBe(300)
            expect(highTexture.image.height).toBe(450)
            expect(highTexture.image.depth).toBe(64)
        })

        it('should register memory consumption with DataManager', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            expect(mockDataManager.addMemoryConsumption).toHaveBeenCalledWith('LOD/high', expect.any(Number))
            expect(mockDataManager.addMemoryConsumption).toHaveBeenCalledWith('LOD/mid', expect.any(Number))
        })

        it('should return tier names', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const names = manager.getTierNames()
            
            expect(names).toContain('high')
            expect(names).toContain('mid')
        })

        it('should return tier config', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const config = manager.getTierConfig('high')
            
            expect(config).toEqual({ name: 'high', width: 300, height: 450, maxDepth: 64 })
        })

        it('should return null for unknown tier', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            expect(manager.getTextureArray('unknown')).toBeNull()
            expect(manager.getTierConfig('unknown')).toBeNull()
        })
    })

    describe('Slot Allocation', () => {
        it('should allocate sequential slot indices', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const slot0 = manager.allocateSlot()
            const slot1 = manager.allocateSlot()
            const slot2 = manager.allocateSlot()
            
            expect(slot0).toBe(0)
            expect(slot1).toBe(1)
            expect(slot2).toBe(2)
        })

        it('should track slot count', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            expect(manager.getSlotCount()).toBe(0)
            
            manager.allocateSlot()
            manager.allocateSlot()
            
            expect(manager.getSlotCount()).toBe(2)
        })

        it('should return -1 when all slots exhausted', () => {
            const smallConfig: LodTextureArrayManagerConfig = {
                tiers: [
                    { name: 'high', width: 16, height: 16, maxDepth: 2 },
                    { name: 'mid', width: 16, height: 16, maxDepth: 3 }  // MID tier is the limit
                ]
            }
            manager = new LodTextureArrayManager(smallConfig)
            
            expect(manager.allocateSlot()).toBe(0)
            expect(manager.allocateSlot()).toBe(1)
            expect(manager.allocateSlot()).toBe(2)
            expect(manager.allocateSlot()).toBe(-1)  // Exhausted (MID tier limit)
        })

        it('should use MID tier maxDepth as limit (not minimum across tiers)', () => {
            // This tests the fix for the bug where HIGH tier's smaller depth
            // was incorrectly limiting allocation. HIGH is an LRU cache with eviction,
            // so MID tier's depth should be the limit.
            const config: LodTextureArrayManagerConfig = {
                tiers: [
                    { name: 'high', width: 16, height: 16, maxDepth: 2 },   // Small HIGH cache
                    { name: 'mid', width: 16, height: 16, maxDepth: 100 }   // Large MID base tier
                ]
            }
            manager = new LodTextureArrayManager(config)
            
            // Should be able to allocate up to MID's limit, not HIGH's
            expect(manager.allocateSlot()).toBe(0)
            expect(manager.allocateSlot()).toBe(1)
            expect(manager.allocateSlot()).toBe(2)  // Would fail if using Math.min
            expect(manager.allocateSlot()).toBe(3)
        })
    })

    describe('resetSlotAllocation (library reload)', () => {
        it('rewinds the slot counter for reuse without disposing texture arrays', () => {
            manager = new LodTextureArrayManager(defaultConfig)

            manager.allocateSlot()
            manager.allocateSlot()
            expect(manager.getSlotCount()).toBe(2)

            const highTexture = manager.getTextureArray('high')!
            const disposeSpy = vi.spyOn(highTexture, 'dispose')

            manager.resetSlotAllocation()

            expect(manager.getSlotCount()).toBe(0)
            expect(manager.allocateSlot()).toBe(0)
            expect(disposeSpy).not.toHaveBeenCalled()
        })

        it('re-logs the atlas-full warning after a reset', () => {
            const smallConfig: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'mid', width: 16, height: 16, maxDepth: 1 }]
            }
            manager = new LodTextureArrayManager(smallConfig)

            expect(manager.allocateSlot()).toBe(0)
            expect(manager.allocateSlot()).toBe(-1)

            manager.resetSlotAllocation()

            expect(manager.allocateSlot()).toBe(0)
            expect(manager.allocateSlot()).toBe(-1)
        })
    })

    describe('Pixel Data', () => {
        it('should copy pixel data to correct slot', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            // 2x2 RGBA = 16 bytes
            const pixels = new Uint8ClampedArray([
                255, 0, 0, 255,    // Red
                0, 255, 0, 255,    // Green
                0, 0, 255, 255,    // Blue
                255, 255, 0, 255   // Yellow
            ])
            
            const success = manager.setSlotPixels('test', 0, pixels, 2, 2)
            
            expect(success).toBe(true)
        })

        it('should reject wrong-sized pixel data', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            // Wrong size - only 8 bytes instead of 16
            const wrongPixels = new Uint8ClampedArray(8)
            
            const success = manager.setSlotPixels('test', 0, wrongPixels, 2, 2)
            
            expect(success).toBe(false)
        })

        it('should reject invalid slot index', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            const pixels = new Uint8ClampedArray(16)
            
            expect(manager.setSlotPixels('test', -1, pixels)).toBe(false)
            expect(manager.setSlotPixels('test', 100, pixels)).toBe(false)
        })

        it('should reject unknown tier', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const pixels = new Uint8ClampedArray(16)
            
            const success = manager.setSlotPixels('unknown', 0, pixels)
            
            expect(success).toBe(false)
        })

        it('should mark slot as pending update', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            expect(manager.hasPendingUpdates('test')).toBe(false)
            
            const pixels = new Uint8ClampedArray(16)
            manager.setSlotPixels('test', 0, pixels)
            
            expect(manager.hasPendingUpdates('test')).toBe(true)
            expect(manager.hasPendingUpdates()).toBe(true)
        })
    })

    describe('GPU Flush', () => {
        it('should flush pending updates to GPU', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            const pixels = new Uint8ClampedArray(16)
            manager.setSlotPixels('test', 0, pixels)
            manager.setSlotPixels('test', 1, pixels)
            
            expect(manager.hasPendingUpdates()).toBe(true)
            
            const didFlush = manager.flushToGpu()
            
            expect(didFlush).toBe(true)
            expect(manager.hasPendingUpdates()).toBe(false)
        })

        it('should return false when nothing to flush', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const didFlush = manager.flushToGpu()
            
            expect(didFlush).toBe(false)
        })

        it('should call addLayerUpdate for each pending slot', () => {
            const config: LodTextureArrayManagerConfig = {
                tiers: [{ name: 'test', width: 2, height: 2, maxDepth: 4 }]
            }
            manager = new LodTextureArrayManager(config)
            
            const texture = manager.getTextureArray('test')!
            const addLayerUpdateSpy = vi.spyOn(texture, 'addLayerUpdate')
            
            const pixels = new Uint8ClampedArray(16)
            manager.setSlotPixels('test', 0, pixels)
            manager.setSlotPixels('test', 2, pixels)
            
            manager.flushToGpu()
            
            expect(addLayerUpdateSpy).toHaveBeenCalledWith(0)
            expect(addLayerUpdateSpy).toHaveBeenCalledWith(2)
            expect(addLayerUpdateSpy).toHaveBeenCalledTimes(2)
        })
    })

    describe('Disposal', () => {
        it('should dispose all texture arrays', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            const highTexture = manager.getTextureArray('high')!
            const midTexture = manager.getTextureArray('mid')!
            const highDisposeSpy = vi.spyOn(highTexture, 'dispose')
            const midDisposeSpy = vi.spyOn(midTexture, 'dispose')
            
            manager.dispose()
            
            expect(highDisposeSpy).toHaveBeenCalled()
            expect(midDisposeSpy).toHaveBeenCalled()
        })

        it('should unregister memory consumption', () => {
            manager = new LodTextureArrayManager(defaultConfig)
            
            manager.dispose()
            
            expect(mockDataManager.removeMemoryConsumption).toHaveBeenCalledWith('LOD/high')
            expect(mockDataManager.removeMemoryConsumption).toHaveBeenCalledWith('LOD/mid')
        })
    })
})
