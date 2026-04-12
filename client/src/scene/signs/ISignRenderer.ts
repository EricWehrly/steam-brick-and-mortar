/**
 * ISignRenderer — strategy interface for 3D sign rendering.
 *
 * A sign request carries a world position, optional text, and style config.
 * The renderer decides *how* to realize it in the scene.
 *
 * Current implementations:
 *   CanvasSignRenderer       — flat PlaneGeometry with baked canvas texture (fast, 2D)
 *   NeonTubeSignRenderer     — TubeGeometry along font outline paths (3D, deferred build)
 *   BlockLetterSignRenderer  — extruded TextGeometry letters (3D, font-loaded async)
 *
 * Usage:
 *   SceneSignManager selects a renderer and delegates to it.
 *   Each renderer owns its own GPU resources and lifecycle.
 *
 * Worker note:
 *   Geometry-heavy renderers (NeonTube, BlockLetter) build geometry off the main
 *   thread or via async font loading. The root Object3D is added to the scene
 *   immediately on setSign(); geometry is applied on completion.
 */

import type * as THREE from 'three'

/**
 * A fully-resolved sign request passed to a renderer.
 *
 * position is the world-space center where the sign should appear.
 * SceneSignManager resolves anchorPosition + mount before calling setSign().
 *
 * text is optional — renderers that don't need text (icon signs, glyphs, etc.)
 * can simply ignore it.
 */
export interface SignRequest {
    /** Unique identifier — used for dedup / update / removal */
    uniqueIdentifier: string
    /** World-space center position of the sign */
    position: THREE.Vector3
    /** Text to display — optional, renderers may ignore if not applicable */
    text?: string
    /** Yaw rotation of the sign face (radians) */
    facingY?: number
    /** Uniform scale multiplier (default: 1.0) */
    scale?: number
    /** Style config — renderers pick what they need */
    style?: SignStyleConfig
}

/**
 * Style configuration for signs.
 *
 * Size is expressed as fontSize (metres) rather than explicit width/height.
 * Physical dimensions are derived by each renderer from the text content,
 * fontSize, and padding.
 *
 * padding follows CSS shorthand notation (values in metres):
 *   "0.05"               — all sides equal
 *   "0.05 0.1"           — vertical | horizontal
 *   "0.05 0.1 0.08"      — top | horizontal | bottom
 *   "0.05 0.1 0.08 0.06" — top | right | bottom | left
 *
 * depth applies to 3D extrude renderers (BlockLetterSignRenderer).
 * Canvas renderers ignore it.
 */
export interface SignStyleConfig {
    /** Primary / foreground color (hex int, e.g. 0xff6600) */
    color?: number
    /** Background color — canvas-based signs only */
    backgroundColor?: number
    /** Text color — canvas-based signs only */
    textColor?: number
    /** Font size in metres (default varies by renderer) */
    fontSize?: number
    /** CSS-shorthand padding string in metres (default "0.05") */
    padding?: string
    /** Extrude depth in metres — 3D signs only (default varies by renderer) */
    depth?: number
}

export interface ISignRenderer {
    /**
     * Create or update a sign in the scene.
     * Returns the root Object3D that was added.
     */
    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D

    /**
     * Remove a previously created sign by uniqueIdentifier.
     * Returns true if a sign was found and removed.
     */
    removeSign(uniqueIdentifier: string, scene: THREE.Scene): boolean

    /**
     * Remove all signs managed by this renderer.
     */
    clearAll(scene: THREE.Scene): void

    /**
     * Dispose all GPU resources owned by this renderer.
     * Called when the parent system is torn down.
     */
    dispose(scene: THREE.Scene): void
}

/**
 * Parse a CSS-shorthand padding string (values in metres) into explicit sides.
 * Exported so renderers and tests can share the same logic.
 */
export function parsePadding(padding: string | undefined): { top: number; right: number; bottom: number; left: number } {
    const values = (padding ?? '0.05').trim().split(/\s+/).map(Number)
    switch (values.length) {
        case 1:  return { top: values[0], right: values[0], bottom: values[0], left: values[0] }
        case 2:  return { top: values[0], right: values[1], bottom: values[0], left: values[1] }
        case 3:  return { top: values[0], right: values[1], bottom: values[2], left: values[1] }
        default: return { top: values[0], right: values[1], bottom: values[2], left: values[3] }
    }
}
