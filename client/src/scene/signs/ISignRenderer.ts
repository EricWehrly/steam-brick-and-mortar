/**
 * ISignRenderer — strategy interface for 3D sign rendering.
 *
 * A sign request carries a position, text, and style config.
 * The renderer decides *how* to realize it in the scene.
 *
 * Current implementations:
 *   CanvasSignRenderer   — flat PlaneGeometry with baked canvas texture (fast, 2D)
 *   NeonTubeSignRenderer — TubeGeometry along font outline paths (3D, deferred build)
 *
 * Planned:
 *   BlockLetterSignRenderer — extruded geometry letters (chunky/retro look)
 *
 * Usage:
 *   SceneSignManager selects a renderer per SignKind and delegates to it.
 *   Each renderer owns its own GPU resources and dispose() lifecycle.
 *
 * Worker note:
 *   Geometry-heavy renderers (NeonTube, BlockLetter) should build in a Worker
 *   and upload to GPU on completion. ManagedWorker is the preferred vehicle.
 *   The current NeonTubeSign implementation uses requestIdleCallback as a
 *   temporary approximation of this; it should migrate to ManagedWorker
 *   once the worker message protocol for geometry transfer is settled.
 *   TD: neon-worker-migration
 */

import type * as THREE from 'three'

export interface SignRequest {
    /** Unique label — used for dedup / update / removal */
    label: string
    /** World-space center position of the sign */
    position: THREE.Vector3
    /** Text to display */
    text: string
    /** Yaw rotation of the sign face (radians) */
    facingY?: number
    /** Uniform scale multiplier (default: 1.0) */
    scale?: number
    /** Arbitrary style config — renderers pick what they need */
    style?: SignStyleConfig
}

export interface SignStyleConfig {
    /** Primary color (hex int, e.g. 0xff6600) */
    color?: number
    /** Background color for canvas-based signs */
    backgroundColor?: number
    /** Text color for canvas-based signs */
    textColor?: number
    /** Canvas sign width in metres */
    width?: number
    /** Canvas sign height in metres */
    height?: number
}

export interface ISignRenderer {
    /**
     * Create or update a sign in the scene.
     * Returns the root Object3D that was added.
     */
    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D

    /**
     * Remove a previously created sign by label.
     * Returns true if a sign was found and removed.
     */
    removeSign(label: string, scene: THREE.Scene): boolean

    /**
     * Dispose all GPU resources owned by this renderer.
     * Called when the parent system is torn down.
     */
    dispose(scene: THREE.Scene): void
}
