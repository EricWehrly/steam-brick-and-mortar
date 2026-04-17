import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { ManagedTextureArray } from '../../../../../src/scene/game-box/instancing/ManagedTextureArray'

describe('ManagedTextureArray', () => {
    const WIDTH = 4
    const HEIGHT = 4
    const DEPTH = 8
    const SLICE = WIDTH * HEIGHT * 4  // bytes per slot

    let array: ManagedTextureArray

    beforeEach(() => {
        array = new ManagedTextureArray({ width: WIDTH, height: HEIGHT, depth: DEPTH })
    })

    afterEach(() => {
        array.dispose()
    })

    describe('Construction', () => {
        it('creates a DataArrayTexture with correct dimensions', () => {
            expect(array.texture).toBeInstanceOf(THREE.DataArrayTexture)
            expect(array.texture.image.width).toBe(WIDTH)
            expect(array.texture.image.height).toBe(HEIGHT)
            expect(array.texture.image.depth).toBe(DEPTH)
        })

        it('exposes the configured dimensions', () => {
            expect(array.width).toBe(WIDTH)
            expect(array.height).toBe(HEIGHT)
            expect(array.depth).toBe(DEPTH)
        })

        it('starts with no pending updates', () => {
            expect(array.hasPendingUpdates()).toBe(false)
            expect(array.pendingCount).toBe(0)
        })
    })

    describe('setSlotPixels', () => {
        it('writes pixels to the correct byte offset', () => {
            const slotIndex = 2
            const pixels = new Uint8ClampedArray(SLICE)
            pixels.fill(0xAB)

            array.setSlotPixels(slotIndex, pixels)

            const backing = array.texture.image.data as Uint8Array
            const offset = slotIndex * SLICE
            // Every byte in the slot should be 0xAB
            for (let i = 0; i < SLICE; i++) {
                expect(backing[offset + i]).toBe(0xAB)
            }
            // Adjacent slots should be untouched
            expect(backing[offset - 1]).toBe(0)
            expect(backing[offset + SLICE]).toBe(0)
        })

        it('marks the slot as pending', () => {
            array.setSlotPixels(0, new Uint8ClampedArray(SLICE))
            expect(array.hasPendingUpdates()).toBe(true)
            expect(array.pendingCount).toBe(1)
        })

        it('rejects a wrong-size pixel buffer', () => {
            const result = array.setSlotPixels(0, new Uint8ClampedArray(SLICE - 1))
            expect(result).toBe(false)
            expect(array.hasPendingUpdates()).toBe(false)
        })

        it('rejects an out-of-range slot', () => {
            const pixels = new Uint8ClampedArray(SLICE)
            expect(array.setSlotPixels(-1, pixels)).toBe(false)
            expect(array.setSlotPixels(DEPTH, pixels)).toBe(false)
            expect(array.hasPendingUpdates()).toBe(false)
        })

        it('accepts the last valid slot', () => {
            const result = array.setSlotPixels(DEPTH - 1, new Uint8ClampedArray(SLICE))
            expect(result).toBe(true)
        })
    })

    describe('flushPendingToGpu', () => {
        it('returns false when nothing is pending', () => {
            expect(array.flushPendingToGpu()).toBe(false)
        })

        it('returns true when there are pending slots', () => {
            array.setSlotPixels(0, new Uint8ClampedArray(SLICE))
            expect(array.flushPendingToGpu()).toBe(true)
        })

        it('clears pending slots after flush', () => {
            array.setSlotPixels(1, new Uint8ClampedArray(SLICE))
            array.setSlotPixels(3, new Uint8ClampedArray(SLICE))
            array.flushPendingToGpu()
            expect(array.hasPendingUpdates()).toBe(false)
            expect(array.pendingCount).toBe(0)
        })

        it('sets needsUpdate=true before calling addLayerUpdate', () => {
            array.setSlotPixels(2, new Uint8ClampedArray(SLICE))

            const texture = array.texture
            const order: string[] = []

            let _needsUpdate = texture.needsUpdate
            Object.defineProperty(texture, 'needsUpdate', {
                get() { return _needsUpdate },
                set(v) {
                    _needsUpdate = v
                    if (v === true) order.push('needsUpdate=true')
                },
                configurable: true
            })
            const orig = texture.addLayerUpdate.bind(texture)
            vi.spyOn(texture, 'addLayerUpdate').mockImplementation((idx) => {
                order.push(`addLayerUpdate(${idx})`)
                return orig(idx)
            })

            array.flushPendingToGpu()

            expect(order).toEqual(['needsUpdate=true', 'addLayerUpdate(2)'])
        })

        it('calls addLayerUpdate for each pending slot', () => {
            array.setSlotPixels(0, new Uint8ClampedArray(SLICE))
            array.setSlotPixels(3, new Uint8ClampedArray(SLICE))
            array.setSlotPixels(7, new Uint8ClampedArray(SLICE))

            const spy = vi.spyOn(array.texture, 'addLayerUpdate')
            array.flushPendingToGpu()

            expect(spy).toHaveBeenCalledTimes(3)
            expect(spy).toHaveBeenCalledWith(0)
            expect(spy).toHaveBeenCalledWith(3)
            expect(spy).toHaveBeenCalledWith(7)
        })
    })

    describe('Debug stripe', () => {
        it('paints the bottom 20% of the slot in the configured color', () => {
            const stripeColor: [number, number, number, number] = [255, 0, 128, 255]
            const striped = new ManagedTextureArray({
                width: WIDTH,
                height: HEIGHT,
                depth: DEPTH,
                debugStripe: stripeColor
            })

            const pixels = new Uint8ClampedArray(SLICE)
            pixels.fill(0x00)
            striped.setSlotPixels(0, pixels)

            const backing = striped.texture.image.data as Uint8Array
            const stripeRows = Math.floor(HEIGHT * 0.2)
            const stripeStartRow = HEIGHT - stripeRows

            // Check that stripe rows have the configured color
            for (let row = stripeStartRow; row < HEIGHT; row++) {
                for (let col = 0; col < WIDTH; col++) {
                    const px = (row * WIDTH + col) * 4
                    expect(backing[px    ]).toBe(stripeColor[0])
                    expect(backing[px + 1]).toBe(stripeColor[1])
                    expect(backing[px + 2]).toBe(stripeColor[2])
                    expect(backing[px + 3]).toBe(stripeColor[3])
                }
            }

            // Rows above the stripe are unchanged (0x00)
            for (let row = 0; row < stripeStartRow; row++) {
                for (let col = 0; col < WIDTH; col++) {
                    const px = (row * WIDTH + col) * 4
                    expect(backing[px]).toBe(0x00)
                }
            }

            striped.dispose()
        })
    })

})
