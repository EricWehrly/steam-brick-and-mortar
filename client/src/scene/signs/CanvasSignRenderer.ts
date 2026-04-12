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
 * On repeated setSign() calls for the same uniqueIdentifier, recycleSign() rebakes the
 * texture in place and only rebuilds geometry when dimensions change.
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
    static readonly defaults = {
        fontSize:        0.18,
        backgroundColor: 0x1a3a5c,
        textColor:       0xffffff,
        padding:         '0.10 0.18',
    } as const

    private readonly renderer: SignageRenderer
    private readonly signs = new Map<string, SignEntry>()

    constructor() {
        this.renderer = new SignageRenderer()
    }

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        const text = request.text ?? ''
        const style = { ...CanvasSignRenderer.defaults, ...(request.style ?? {}) }
        const padding = parsePadding(style.padding)
        const dimensions = deriveSignDimensions(text, style.fontSize, padding)

        const backgroundColor = style.backgroundColor
        const textColor = style.textColor

        const existing = this.signs.get(request.uniqueIdentifier)
        if (existing) {
            return this.recycleSign(existing, request, text, backgroundColor, textColor, dimensions)
        }
        return this.createSign(request, scene, text, backgroundColor, textColor, dimensions)
    }

    private recycleSign(
        existing: SignEntry,
        request: SignRequest,
        text: string,
        backgroundColor: number,
        textColor: number,
        dimensions: { width: number; height: number },
    ): THREE.Mesh {
        const { mesh } = existing
        const mat = mesh.material as THREE.MeshStandardMaterial

        mat.map?.dispose()
        mat.map = this.renderer.bakeTexture(text, backgroundColor, textColor)
        mat.needsUpdate = true

        if (existing.width !== dimensions.width || existing.height !== dimensions.height) {
            mesh.geometry.dispose()
            mesh.geometry = new THREE.PlaneGeometry(dimensions.width, dimensions.height)
            existing.width = dimensions.width
            existing.height = dimensions.height
        }

        mesh.position.copy(request.position)
        if (request.facingY !== undefined) mesh.rotation.y = request.facingY

        return mesh
    }

    private createSign(
        request: SignRequest,
        scene: THREE.Scene,
        text: string,
        backgroundColor: number,
        textColor: number,
        dimensions: { width: number; height: number },
    ): THREE.Mesh {
        const mesh = this.renderer.createSign({
            text,
            position: request.position,
            backgroundColor,
            textColor,
            width:  dimensions.width,
            height: dimensions.height,
        })

        if (request.facingY !== undefined) mesh.rotation.y = request.facingY

        scene.add(mesh)
        this.signs.set(request.uniqueIdentifier, { mesh, width: dimensions.width, height: dimensions.height })
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
