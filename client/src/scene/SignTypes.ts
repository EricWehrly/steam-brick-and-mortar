/**
 * Shared sign system types.
 *
 * Lives here rather than in ISignRenderer so the interface doesn't enumerate
 * its own implementations, and renderers don't need to import from each other.
 * SceneSignManager and layout coordinators import from here.
 */

import type * as THREE from 'three'
import type { SignStyleConfig } from './signs/ISignRenderer'

export type RenderKind = 'canvas' | 'neon-tube' | 'block-letter'

export type SignMountStyle = 'above-shelf' | 'wall' | 'ceiling'

/**
 * Describes how a sign attaches to its anchor point in the scene.
 *
 * The anchor is a semantic reference position (shelf top, ceiling plane, etc.).
 * Mount style + offsets determine the sign's final world position.
 *
 * Attachment intent (not yet implemented — TODO(layout)):
 *   Signs have a natural attachment edge that connects to the anchor surface:
 *   - 'ceiling': top edge of the sign connects to the bottom of the ceiling.
 *     Final position = ceiling Y minus half sign height.
 *   - 'above-shelf': bottom edge connects to the top face of the shelf bracket.
 *     Final position = shelf-face Y plus half sign height (derived from font size + padding).
 *   - 'wall': face of sign flush with the wall surface.
 *
 *   Once sign dimensions are computed by renderers (ISignRenderer.measure() or similar),
 *   the mount resolver can use them to place signs edge-to-surface rather than
 *   anchor-to-centre. Until then, yOffset carries the full manual offset.
 */
export interface SignMount {
    style: SignMountStyle
    yOffset?: number
    frontOffset?: number
    signFacingY?: number
}

/** Geometry of the topmost surface of a shelf unit, used to anchor end-cap labels. */
export interface ShelfTopSurface {
    centerX: number
    topY: number
    /** Z extent furthest from the player (back face). */
    backZ: number
    /** Z extent closest to the player (front face). */
    frontZ: number
    width: number
}

/**
 * Descriptor passed to SceneSignManager.placeSign().
 *
 * anchorPosition is a semantic reference point (shelf origin, ceiling plane, etc.).
 * For canvas signs, mount drives position resolution. For 3D signs (neon-tube,
 * block-letter), anchorPosition is used as the direct world position.
 */
export interface SignDescriptor {
    uniqueIdentifier: string
    text?: string
    anchorPosition: THREE.Vector3
    mount?: SignMount
    style?: SignStyleConfig
    scale?: number
    facingY?: number
}
