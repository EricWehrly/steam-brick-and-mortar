/**
 * Turns raw screenshot image bytes into a Three.js texture at a poster-appropriate resolution -
 * capped well below a native screenshot capture (observed up to 2560x1600 locally, see
 * docs/features/wall-art-framed-posters.md) but larger than box-art textures (300x450 - see
 * LodTypes.ts's HIGH tier), since posters are a small-N decorative set rendered as plain
 * per-frame planes, not an instanced hundreds-at-once atlas (that's why this builds a plain
 * THREE.CanvasTexture, deliberately not touching ManagedTextureArray/DataArrayTexture at all).
 *
 * Standalone on purpose - GameArtworkProvider's cache-first fetch pattern is the thing worth
 * reusing conceptually for a future real pipeline (per the poster doc), not this resize step,
 * which is a plain main-thread canvas draw. No worker offload yet; revisit if resizing dozens of
 * screenshots at once ever visibly stalls a frame.
 */

import * as THREE from 'three'

/** Caps the longer edge to this many px, preserving aspect ratio. ~8x box art's pixel count
 *  (300x450 = 135,000px), ~84% smaller than a native 2560x1600 screenshot capture. */
export const POSTER_MAX_DIMENSION = 1024

export async function buildPosterTexture(
    bytes: Uint8Array,
    maxDimension: number = POSTER_MAX_DIMENSION
): Promise<THREE.CanvasTexture> {
    // .slice() (not .buffer) - a plain ArrayBuffer-backed copy, not the generic
    // Uint8Array<ArrayBufferLike> TS's DOM lib won't accept as a BlobPart directly.
    const blob = new Blob([bytes.slice()], { type: 'image/jpeg' })
    const bitmap = await createImageBitmap(blob)

    try {
        const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
        const targetWidth = Math.max(1, Math.round(bitmap.width * scale))
        const targetHeight = Math.max(1, Math.round(bitmap.height * scale))

        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Failed to acquire 2D canvas context for poster texture')
        }
        ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        return texture
    } finally {
        bitmap.close()
    }
}
