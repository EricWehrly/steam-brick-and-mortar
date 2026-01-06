import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { LodTextureArrayManager, type LodTextureArrayManagerConfig } from '../../../../../src/scene/game-box/instancing/LodTextureArrayManager'

describe('LodTextureArrayManager', () => {
    let manager: LodTextureArrayManager
    let config: LodTextureArrayManagerConfig

    beforeEach(() => {
        config = {
            tiers: [
                { name: 'high', width: 300, height: 450, maxDepth: 10 },
                { name: 'mid', width: 180, height: 270, maxDepth: 20 }
            ]
        }
        manager = new LodTextureArrayManager(config)
    })

    describe('texture array initialization', () => {
        it('should create texture arrays for each tier', () => {
            const highTexture = manager.getTextureArray('high')
            const midTexture = manager.getTextureArray('mid')

            expect(highTexture).toBeTruthy()
            expect(midTexture).toBeTruthy()
            expect(highTexture).toBeInstanceOf(THREE.DataArrayTexture)
            expect(midTexture).toBeInstanceOf(THREE.DataArrayTexture)
        })

        it('should set needsUpdate to true on initialization', () => {
            const highTexture = manager.getTextureArray('high')
            const midTexture = manager.getTextureArray('mid')

            // Initial needsUpdate should be true to trigger first GPU upload
            expect(highTexture!.needsUpdate).toBe(true)
            expect(midTexture!.needsUpdate).toBe(true)
        })
    })

    describe('setSlotPixels', () => {
        it('should add layer to pendingUpdates', () => {
            const slotIndex = 0
            const pixelData = new Uint8ClampedArray(180 * 270 * 4)
            
            const success = manager.setSlotPixels('mid', slotIndex, pixelData, 180, 270)
            
            expect(success).toBe(true)
            expect(manager.hasPendingUpdates('mid')).toBe(true)
        })
    })

    describe('flushToGpu - REGRESSION TEST FOR UNDEFINED needsUpdate', () => {
        it('should set needsUpdate to true (not undefined) when flushing', () => {
            // Arrange: Load some texture data
            const slotIndex = 0
            const pixelData = new Uint8ClampedArray(180 * 270 * 4)
            pixelData.fill(255) // White texture for testing
            
            manager.setSlotPixels('mid', slotIndex, pixelData, 180, 270)
            
            const midTexture = manager.getTextureArray('mid')!
            
            // Reset needsUpdate to simulate post-render state
            midTexture.needsUpdate = false
            expect(midTexture.needsUpdate).toBe(false)
            
            // Act: Flush to GPU
            const flushed = manager.flushToGpu()
            
            // Assert: needsUpdate should be explicitly true (not undefined)
            expect(flushed).toBe(true)
            expect(midTexture.needsUpdate).toBe(true)
            expect(midTexture.needsUpdate).not.toBeUndefined()
            expect(typeof midTexture.needsUpdate).toBe('boolean')
        })

        it('should use addLayerUpdate for partial updates', () => {
            const slotIndex = 5
            const pixelData = new Uint8ClampedArray(180 * 270 * 4)
            
            manager.setSlotPixels('mid', slotIndex, pixelData, 180, 270)
            
            const midTexture = manager.getTextureArray('mid')!
            const addLayerUpdateSpy = vi.spyOn(midTexture, 'addLayerUpdate')
            
            manager.flushToGpu()
            
            expect(addLayerUpdateSpy).toHaveBeenCalledWith(slotIndex)
        })

        it('should clear pendingUpdates after flush', () => {
            const pixelData = new Uint8ClampedArray(180 * 270 * 4)
            
            manager.setSlotPixels('mid', 0, pixelData, 180, 270)
            manager.setSlotPixels('mid', 1, pixelData, 180, 270)
            
            expect(manager.hasPendingUpdates('mid')).toBe(true)
            
            manager.flushToGpu()
            
            expect(manager.hasPendingUpdates('mid')).toBe(false)
        })

        it('should return false when no pending updates', () => {
            const flushed = manager.flushToGpu()
            expect(flushed).toBe(false)
        })

        it('should flush multiple tiers independently', () => {
            const midPixels = new Uint8ClampedArray(180 * 270 * 4)
            const highPixels = new Uint8ClampedArray(300 * 450 * 4)
            
            manager.setSlotPixels('mid', 0, midPixels, 180, 270)
            manager.setSlotPixels('high', 0, highPixels, 300, 450)
            
            const midTexture = manager.getTextureArray('mid')!
            const highTexture = manager.getTextureArray('high')!
            
            midTexture.needsUpdate = false
            highTexture.needsUpdate = false
            
            manager.flushToGpu()
            
            expect(midTexture.needsUpdate).toBe(true)
            expect(highTexture.needsUpdate).toBe(true)
        })
    })
})
