/**
 * CanvasSignRenderer — ISignRenderer implementation backed by canvas-texture plane meshes.
 *
 * Delegates all texture/geometry creation to SignageRenderer. Owns the lifecycle of every
 * mesh it creates: geometry, material, and texture are all disposed on removeSign/dispose.
 *
 * Recycling behaviour:
 *   - Same dimensions → re-bake texture in place, geometry reused.
 *   - Different dimensions → dispose old geometry, create fresh PlaneGeometry.
 *   - Position and facingY are always applied on every update.
 */

import * as THREE from 'three'
import { SignageRenderer } from '../SignageRenderer'
import type { ISignRenderer, SignRequest } from './ISignRenderer'

interface SignEntry {
    mesh: THREE.Mesh
    width: number
    height: number
}

const DEFAULT_WIDTH = 2.0
const DEFAULT_HEIGHT = 0.4
const DEFAULT_BG_COLOR = 0x1a3a5c
const DEFAULT_TEXT_COLOR = 0xffffff

export class CanvasSignRenderer implements ISignRenderer {
    private readonly renderer: SignageRenderer
    private readonly signs = new Map<string, SignEntry>()

    constructor() {
        this.renderer = new SignageRenderer()
    }

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        const style = request.style ?? {}
        const width = style.width ?? DEFAULT_WIDTH
        const height = style.height ?? DEFAULT_HEIGHT
        const backgroundColor = style.backgroundColor ?? DEFAULT_BG_COLOR
        const textColor = style.textColor ?? DEFAULT_TEXT_COLOR

        const existing = this.signs.get(request.label)

        if (existing) {
            // ── Recycle path ─────────────────────────────────────────────────
            const { mesh } = existing
            const mat = mesh.material as THREE.MeshStandardMaterial

            mat.map?.dispose()
            mat.map = this.renderer.bakeTexture(request.text, backgroundColor, textColor)
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
            text: request.text,
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
        this.signs.set(request.label, { mesh, width, height })
        return mesh
    }

    removeSign(label: string, scene: THREE.Scene): boolean {
        const entry = this.signs.get(label)
        if (!entry) return false

        scene.remove(entry.mesh)
        const mat = entry.mesh.material as THREE.MeshStandardMaterial
        mat.map?.dispose()
        mat.dispose()
        entry.mesh.geometry.dispose()
        this.signs.delete(label)
        return true
    }

    dispose(scene: THREE.Scene): void {
        for (const label of [...this.signs.keys()]) {
            this.removeSign(label, scene)
        }
        this.renderer.dispose()
    }
}
