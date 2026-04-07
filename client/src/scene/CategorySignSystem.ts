/**
 * CategorySignSystem
 *
 * Generic scene-space sign system for category labels.
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / CategorySignSystem → SceneSignManager rename"
 *
 * A "sign" is a canvas-texture plane mesh with configurable:
 * - Text and color
 * - Mount style: above-shelf, wall-mounted, ceiling-hung
 *
 * This sits on top of SignageRenderer's createSign() primitive.
 * Visual styles (Blockbuster, neon, flat, etc.) are applied by passing
 * a SignStyle config. Multiple realizations share one code path.
 *
 * Phase 1: above-shelf signs only.
 * Phase 2: wall + ceiling mount styles.
 */

import * as THREE from 'three'
import { SignageRenderer, type SignageConfig } from './SignageRenderer'

// ─── Style definitions ────────────────────────────────────────────────────────

export interface SignStyle {
    backgroundColor: number
    textColor: number
    width: number
    height: number
}

export const SignStyles = {
    /** Default Blockbuster-style blue sign */
    Category: {
        backgroundColor: 0x1a3a5c,
        textColor: 0xffffff,
        width: 2.2,
        height: 0.38,
    } satisfies SignStyle,

    /** Accent color — for featured/highlighted sections */
    Featured: {
        backgroundColor: 0x8b0000,
        textColor: 0xffffff,
        width: 2.2,
        height: 0.38,
    } satisfies SignStyle,
} as const

// ─── Mount styles ─────────────────────────────────────────────────────────────

export type SignMountStyle = 'above-shelf' | 'wall' | 'ceiling'

export interface SignMount {
    style: SignMountStyle
    /**
     * Y offset from the mount anchor point.
     * For above-shelf: offset above the shelf top (default 0.3m).
     * For ceiling: offset below ceiling plane.
     * For wall: offset from wall surface.
     */
    yOffset?: number
}

// ─── Category sign descriptor ─────────────────────────────────────────────────

export interface CategorySignDescriptor {
    label: string
    anchorPosition: THREE.Vector3   // World position to anchor sign to (e.g. shelf center)
    mount: SignMount
    style?: SignStyle
}

// ─── System ───────────────────────────────────────────────────────────────────

export class CategorySignSystem {
    private readonly renderer: SignageRenderer
    private readonly scene: THREE.Scene
    private readonly signs: Map<string, THREE.Mesh> = new Map()

    private static readonly ABOVE_SHELF_DEFAULT_Y_OFFSET = 0.6
    private static readonly SIGN_Z_FACE_PLAYER = 0.01 // slight forward push to avoid z-fighting

    // Tech debt link: docs/roadmaps/tech-debt.md →
    // - "Category System Tech Debt / CategorySignSystem: scene access pattern / SceneManager"
    // - "Category System Tech Debt / SignageRenderer: singleton vs instance"
    constructor(scene: THREE.Scene) {
        this.scene = scene
        this.renderer = new SignageRenderer()
    }

    /**
     * Create or update a category sign.
     * If a sign with this label already exists, it is replaced.
     */
    public setSign(descriptor: CategorySignDescriptor): THREE.Mesh {
        // Remove existing sign with same label if present
        this.removeSign(descriptor.label)

        const style = descriptor.style ?? SignStyles.Category
        const signPos = this.resolvePosition(descriptor.anchorPosition, descriptor.mount)

        const config: SignageConfig = {
            text: descriptor.label,
            position: signPos,
            backgroundColor: style.backgroundColor,
            textColor: style.textColor,
            width: style.width,
            height: style.height,
        }

        const mesh = this.renderer.createSign(config)
        mesh.userData.categoryLabel = descriptor.label
        mesh.userData.mountStyle = descriptor.mount.style

        this.scene.add(mesh)
        this.signs.set(descriptor.label, mesh)

        return mesh
    }

    /** Remove a named sign from the scene. */
    public removeSign(label: string): void {
        const existing = this.signs.get(label)
        if (existing) {
            this.scene.remove(existing)
            const mat = existing.material as THREE.MeshStandardMaterial
            mat.map?.dispose()
            mat.dispose()
            existing.geometry.dispose()
            this.signs.delete(label)
        }
    }

    /** Remove all signs. */
    public clearAll(): void {
        for (const label of [...this.signs.keys()]) {
            this.removeSign(label)
        }
    }

    public dispose(): void {
        this.clearAll()
        this.renderer.dispose()
    }

    // ─── Position resolution ──────────────────────────────────────────────────

    private resolvePosition(anchor: THREE.Vector3, mount: SignMount): THREE.Vector3 {
        switch (mount.style) {
            case 'above-shelf': {
                const yOff = mount.yOffset ?? CategorySignSystem.ABOVE_SHELF_DEFAULT_Y_OFFSET
                return new THREE.Vector3(
                    anchor.x,
                    anchor.y + yOff,
                    anchor.z - CategorySignSystem.SIGN_Z_FACE_PLAYER // face player
                )
            }
            case 'wall':
            case 'ceiling': {
                // TODO: Phase 2 — wall and ceiling mount resolution
                // Wall: position at anchor.x, anchor.y + yOffset, against nearest wall Z
                // Ceiling: position at anchor.x, ceilingHeight - yOffset, anchor.z
                const yOff = mount.yOffset ?? 0
                return new THREE.Vector3(anchor.x, anchor.y + yOff, anchor.z)
            }
        }
    }
}
