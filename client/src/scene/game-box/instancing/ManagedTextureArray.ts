/** Shared DataArrayTexture wrapper with pending-layer tracking. */

import * as THREE from 'three'

export interface ManagedTextureArrayConfig {
    width: number
    height: number
    depth: number
    /** Optional RGBA stripe painted on the bottom 20% of written slots. */
    debugStripe?: readonly [number, number, number, number]
}

export class ManagedTextureArray {
    readonly width: number
    readonly height: number
    readonly depth: number

    private _texture: THREE.DataArrayTexture
    private readonly pendingSlots: Set<number> = new Set()
    private readonly debugStripe: readonly [number, number, number, number] | undefined

    /** Allocate the backing DataArrayTexture. */
    constructor(config: ManagedTextureArrayConfig) {
        this.width = config.width
        this.height = config.height
        this.depth = config.depth
        this.debugStripe = config.debugStripe

        const data = new Uint8Array(config.width * config.height * config.depth * 4)
        const texture = new THREE.DataArrayTexture(data, config.width, config.height, config.depth)
        texture.format = THREE.RGBAFormat
        texture.type = THREE.UnsignedByteType
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        texture.needsUpdate = true
        this._texture = texture
    }

    /** Underlying texture for shader uniforms. */
    get texture(): THREE.DataArrayTexture {
        return this._texture
    }


    /**
     * Copy pixel data into a slot and mark it dirty.
     *
     * @param slotIndex  Layer index in the array (0-based).
     * @param pixels     RGBA pixel data — must be exactly width × height × 4 bytes.
     * @returns false if the slot is out of range or the pixel buffer is the wrong size.
     */
    setSlotPixels(slotIndex: number, pixels: Uint8ClampedArray): boolean {
        if (slotIndex < 0 || slotIndex >= this.depth) return false

        const expectedSize = this.width * this.height * 4
        if (pixels.length !== expectedSize) return false

        const offset = slotIndex * expectedSize
        const arrayData = this._texture.image.data as Uint8Array

        if (this.debugStripe) {
            const stripeRows = Math.floor(this.height * 0.2)
            const stripeStart = (this.height - stripeRows) * this.width * 4

            arrayData.set(pixels, offset)

            const [r, g, b, a] = this.debugStripe
            for (let row = 0; row < stripeRows; row++) {
                const rowOffset = offset + stripeStart + row * this.width * 4
                for (let col = 0; col < this.width; col++) {
                    const px = rowOffset + col * 4
                    arrayData[px]     = r
                    arrayData[px + 1] = g
                    arrayData[px + 2] = b
                    arrayData[px + 3] = a
                }
            }
        } else {
            arrayData.set(pixels, offset)
        }

        this.pendingSlots.add(slotIndex)
        return true
    }

    /** True when there are pending layer uploads. */
    hasPendingUpdates(): boolean {
        return this.pendingSlots.size > 0
    }

    /**
     * Flush all pending slots to the GPU using partial layer updates.
     * @returns true if any layers were flushed.
     */
    flushPendingToGpu(): boolean {
        if (this.pendingSlots.size === 0) return false

        this._texture.needsUpdate = true
        for (const slot of this.pendingSlots) {
            this._texture.addLayerUpdate(slot)
        }
        this.pendingSlots.clear()
        return true
    }

    /** Pending layer count. */
    get pendingCount(): number {
        return this.pendingSlots.size
    }

    dispose(): void {
        this._texture.dispose()
        this.pendingSlots.clear()
    }
}
