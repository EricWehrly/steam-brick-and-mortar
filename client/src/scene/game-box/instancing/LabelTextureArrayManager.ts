/**
 * LabelTextureArrayManager
 *
 * Manages the DataArrayTexture backing the instanced label renderer.
 * Each array slice holds a canvas-rendered text label for one game.
 *
 * Delegates GPU allocation and dirty-tracking to ManagedTextureArray,
 * which is the same primitive used by LodTextureArrayManager for artwork.
 */

import * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { ManagedTextureArray } from './ManagedTextureArray'

export class LabelTextureArrayManager {
    private readonly textureSize: number
    private readonly maxTextureCapacity: number
    private managedArray: ManagedTextureArray
    private nextTextureIndex: number = 0
    private hasLoggedTextureCapacity: boolean = false

    // Shared canvas for text rendering — created once, reused per label
    private readonly sharedCanvas: HTMLCanvasElement
    private readonly sharedContext: CanvasRenderingContext2D

    constructor(textureSize: number = 128, maxTextures: number = 256) {
        this.textureSize = textureSize
        this.maxTextureCapacity = Math.max(maxTextures, 1)

        this.managedArray = new ManagedTextureArray({
            width: textureSize,
            height: textureSize,
            depth: this.maxTextureCapacity,
        })

        this.sharedCanvas = document.createElement('canvas')
        this.sharedCanvas.width = textureSize
        this.sharedCanvas.height = textureSize
        const ctx = this.sharedCanvas.getContext('2d')
        if (!ctx) throw new Error('LabelTextureArrayManager: failed to get 2D canvas context')
        this.sharedContext = ctx

        const vramMB = Math.round((textureSize * textureSize * this.maxTextureCapacity * 4) / (1024 * 1024))
        DataManager.getInstance().addMemoryConsumption('Labels/textureArray', vramMB)

        console.debug(`📦 [LabelTextureArrayManager] Initialized with texture size: ${textureSize}x${textureSize}, max: ${this.maxTextureCapacity}`)
    }

    /** Underlying texture for use in shader uniforms. */
    get texture(): THREE.DataArrayTexture {
        return this.managedArray.texture
    }

    /**
     * Render a text label onto the canvas and write the pixels into the next
     * available array slot. Returns the slot index.
     */
    public addTextLabel(label: string): number {
        if (this.nextTextureIndex >= this.managedArray.depth) {
            if (this.managedArray.depth < this.maxTextureCapacity) {
                const grownDepth = Math.min(this.maxTextureCapacity, Math.max(this.managedArray.depth * 2, this.nextTextureIndex + 1))
                this.resizeTextureArray(grownDepth, 'Expanded')
            }
        }

        if (this.nextTextureIndex >= this.managedArray.depth) {
            if (!this.hasLoggedTextureCapacity) {
                console.error(
                    `🚫 [LabelTextureArrayManager] Maximum textures reached (${this.managedArray.depth}); suppressing repeated errors`
                )
                this.hasLoggedTextureCapacity = true
            }
            throw new Error('Maximum label textures reached')
        }

        const index = this.nextTextureIndex++

        this.sharedContext.clearRect(0, 0, this.textureSize, this.textureSize)
        this.drawTextLabel(this.sharedContext, label, this.textureSize)
        const imageData = this.sharedContext.getImageData(0, 0, this.textureSize, this.textureSize)

        this.managedArray.setSlotPixels(index, imageData.data)

        return index
    }

    /**
     * Flush pending texture updates to the GPU.
     * Call once after adding a batch of labels.
     */
    public flushToGpu(): void {
        this.managedArray.flushPendingToGpu()
    }

    /**
     * Compact the texture array down to the actual number of labels written.
     * Disposes the over-allocated array and replaces it with a right-sized one,
     * re-uploading all written pixel data. Call once after artwork failures have
     * settled (e.g. debounced after AllBatchesComplete + artwork-settle window).
     *
     * @returns the new THREE.DataArrayTexture (caller must update shader uniforms)
     */
    public compact(): THREE.DataArrayTexture {
        const actualCount = this.nextTextureIndex
        if (actualCount === 0 || actualCount >= this.managedArray.depth) {
            // Nothing to trim — return existing texture unchanged
            return this.managedArray.texture
        }

        const bufferedTarget = Math.min(this.maxTextureCapacity, Math.ceil(actualCount * 1.25))
        const targetDepth = Math.max(actualCount, bufferedTarget)
        if (targetDepth >= this.managedArray.depth) {
            return this.managedArray.texture
        }

        this.resizeTextureArray(targetDepth, 'Compacted')

        return this.managedArray.texture
    }

    public getStats(): {
        textureSize: number
        allocatedLayers: number
        usedLayers: number
        memoryEstimate: string
    } {
        const allocated = this.managedArray.depth
        const used = this.nextTextureIndex
        const mb = ((this.textureSize * this.textureSize * allocated * 4) / (1024 * 1024)).toFixed(2)
        return { textureSize: this.textureSize, allocatedLayers: allocated, usedLayers: used, memoryEstimate: `${mb} MB` }
    }

    public dispose(): void {
        this.managedArray.dispose()
        DataManager.getInstance().removeMemoryConsumption('Labels/textureArray')
        console.log('🗑️ [LabelTextureArrayManager] Disposed')
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private drawTextLabel(ctx: CanvasRenderingContext2D, text: string, size: number): void {
        // Background
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, size, size)

        // Pre-mirror horizontally: the rotation convention for Front-side boxes puts the
        // -Z face of BoxGeometry toward the player (artwork convention: Front=rotY+PI).
        // BoxGeometry's -Z face has reversed U coordinates, so pre-mirroring the canvas
        // cancels that out and makes the text read correctly.
        // Back-side boxes show the +Z face (standard UVs); those labels are also
        // pre-mirrored here, which would reverse them — but Back-side boxes are
        // rendered DoubleSide so the viewer always sees the face with readable text.
        ctx.save()
        ctx.scale(-1, 1)
        ctx.translate(-size, 0)

        ctx.fillStyle = '#ffffff'
        ctx.font = `bold ${Math.floor(size / 10)}px Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Word wrap
        const maxWidth = size * 0.9
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = words[0]

        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i]
            if (ctx.measureText(testLine).width > maxWidth) {
                lines.push(currentLine)
                currentLine = words[i]
            } else {
                currentLine = testLine
            }
        }
        lines.push(currentLine)

        const lineHeight = size / 10
        const totalHeight = lines.length * lineHeight
        const startY = (size - totalHeight) / 2 + lineHeight / 2

        lines.forEach((line, i) => {
            ctx.fillText(line, size / 2, startY + i * lineHeight)
        })

        ctx.restore()
    }

    private resizeTextureArray(newDepth: number, reason: 'Compacted' | 'Expanded'): void {
        const oldDepth = this.managedArray.depth
        if (newDepth === oldDepth) return

        const size = this.textureSize
        const sliceBytes = size * size * 4
        const oldData = this.managedArray.texture.image.data as Uint8Array
        const usedSlices = Math.min(this.nextTextureIndex, oldDepth)
        const savedPixels = new Uint8Array(usedSlices * sliceBytes)
        savedPixels.set(oldData.subarray(0, usedSlices * sliceBytes))

        const oldVramMB = Math.round((size * size * oldDepth * 4) / (1024 * 1024))
        DataManager.getInstance().removeMemoryConsumption('Labels/textureArray')
        this.managedArray.dispose()

        this.managedArray = new ManagedTextureArray({ width: size, height: size, depth: newDepth })
        for (let i = 0; i < usedSlices; i++) {
            const slice = new Uint8ClampedArray(savedPixels.buffer, i * sliceBytes, sliceBytes)
            this.managedArray.setSlotPixels(i, slice)
        }
        this.managedArray.flushPendingToGpu()

        const newVramMB = Math.round((size * size * newDepth * 4) / (1024 * 1024))
        DataManager.getInstance().addMemoryConsumption('Labels/textureArray', newVramMB)

        const deltaMB = newVramMB - oldVramMB
        const direction = deltaMB >= 0 ? '+' : ''
        console.log(
            `📦 [LabelTextureArrayManager] ${reason}: ${oldDepth} → ${newDepth} slots (${direction}${deltaMB}MB est.)`
        )
    }
}
