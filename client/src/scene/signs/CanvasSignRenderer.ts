/**
 * CanvasSignRenderer — ISignRenderer implementation backed by canvas-texture plane meshes.
 *
 * Delegates all texture/geometry creation to SignageRenderer. Owns the lifecycle of every
 * mesh it creates: geometry, material, and texture are all disposed on removeSign/dispose.
 *
 * Physical dimensions are derived from fontSize and padding rather than being specified
 * directly. The canvas renderer measures the rendered text width and adds padding to
 * compute PlaneGeometry dimensions.
 *
 * Recycling behaviour:
 *   - Same derived dimensions → re-bake texture in place, geometry reused.
 *   - Different derived dimensions → dispose old geometry, create fresh PlaneGeometry.
 *   - Position and facingY are always applied on every update.
 */

import * as THREE from 'three'
import { SignageRenderer } from '../SignageRenderer'
import type { ISignRenderer, SignRequest } from './ISignRenderer'
import { parsePadding } from './ISignRenderer'

interface SignEntry {
    mesh: THREE.Mesh
    /** Derived physical width in metres — cached for geometry-recycle check */
    width: number
    /** Derived physical height in metres — cached for geometry-recycle check */
    height: number
}

const DEFAULT_FONT_SIZE   = 0.18   // metres — readable at arm's length in VR
const DEFAULT_BG_COLOR    = 0x1a3a5c
const DEFAULT_TEXT_COLOR  = 0xffffff

/**
 * Estimate physical sign dimensions from fontSize and padding.
 * Character width is approximated at 0.6× fontSize (typical for bold sans-serif).
 * Height is 1× fontSize plus vertical padding.
 */
function deriveSignDimensions(
    text: string,
    fontSize: number,
    padding: ReturnType<typeof parsePadding>,
): { width: number; height: number } {
    const charWidth = fontSize * 0.6
    const textWidth = text.length * charWidth
    const width  = textWidth + padding.left + padding.right
    const height = fontSize  + padding.top  + padding.bottom
    return { width, height }
}

export class CanvasSignRenderer implements ISignRenderer {
    private readonly renderer: SignageRenderer
    private readonly signs = new Map<string, SignEntry>()

    constructor() {
        this.renderer = new SignageRenderer()
    }

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        const text = request.text ?? ''
        const style         = request.style ?? {}
        const fontSize      = style.fontSize ?? DEFAULT_FONT_SIZE
        const padding       = parsePadding(style.padding)
        const backgroundColor = style.backgroundColor ?? DEFAULT_BG_COLOR
        const textColor     = style.textColor ?? DEFAULT_TEXT_COLOR
        const { width, height } = deriveSignDimensions(text, fontSize, padding)

        const existing = this.signs.get(request.uniqueIdentifier)

        if (existing) {
            // ── Recycle path ─────────────────────────────────────────────────
            const { mesh } = existing
            const mat = mesh.material as THREE.MeshStandardMaterial

            mat.map?.dispose()
            mat.map = this.renderer.bakeTexture(text, backgroundColor, textColor)
            mat.needsUpdate = true

            if (existing.width !== width || existing.height !== height) {
                mesh.geometry.dispose()
                mesh.geometry = new THREE.PlaneGeometry(width, height)
                existing.width = width
                existing.height = height
            }

            mesh.position.copy(request.position)
            if (request.facingY !== undefined) {
                mesh.rotation.y = request.facingY
            }

            return mesh
        }

        // ── Create path ───────────────────────────────────────────────────────
        const mesh = this.renderer.createSign({
            text,
            position: request.position,
            backgroundColor,
            textColor,
            width,
            height,
        })

        if (request.facingY !== undefined) {
            mesh.rotation.y = request.facingY
        }

        scene.add(mesh)
        this.signs.set(request.uniqueIdentifier, { mesh, width, height })
        return mesh
    }

    removeSign(uniqueIdentifier: string, scene: THREE.Scene): boolean {
        const entry = this.signs.get(uniqueIdentifier)
        if (!entry) return false

        scene.remove(entry.mesh)
        const mat = entry.mesh.material as THREE.MeshStandardMaterial
        mat.map?.dispose()
        mat.dispose()
        entry.mesh.geometry.dispose()
        this.signs.delete(uniqueIdentifier)
        return true
    }

    clearAll(scene: THREE.Scene): void {
        for (const uniqueIdentifier of [...this.signs.keys()]) {
            this.removeSign(uniqueIdentifier, scene)
        }
    }

    dispose(scene: THREE.Scene): void {
        this.clearAll(scene)
        this.renderer.dispose()
    }
}
