/**
 * NeonAmpersandSign
 *
 * Spike: 3D neon-style "&" sign using TubeGeometry + CatmullRomCurve3.
 * Intended for category divider signage in the store.
 *
 * Status: prototype — not wired into scene yet.
 * See docs/plans/neon-sign-3d-design.md for integration notes.
 *
 * Visual approach:
 * - TubeGeometry traces the ampersand glyph via control points
 * - MeshStandardMaterial with high emissive for neon glow
 * - Optional PointLight at center for environmental bloom without PostProcessing
 */

import * as THREE from 'three'

export interface NeonAmpersandConfig {
    /** Hex color integer, e.g. 0xff6600 */
    color: number
    /** World-space position for the sign center */
    position: THREE.Vector3
    /** Uniform scale multiplier (default: 1.0) */
    scale?: number
    /** Whether to add a point light at center for environmental glow (default: true) */
    addLight?: boolean
}

/**
 * Control points tracing a stylised "&" glyph in the XY plane.
 * Normalised to roughly [-0.5, 0.5] in X and [-0.5, 0.5] in Y — scale via config.
 */
function buildAmpersandCurve(): THREE.CatmullRomCurve3 {
    // Approximate an ampersand shape with a single looping spline.
    // Upper loop → crossover → lower loop → diagonal tail.
    const pts = [
        // Upper-left loop start
        new THREE.Vector3(-0.05, 0.4, 0),
        new THREE.Vector3(-0.3, 0.35, 0),
        new THREE.Vector3(-0.35, 0.15, 0),
        new THREE.Vector3(-0.15, 0.0, 0),
        // Crossover
        new THREE.Vector3(0.05, -0.05, 0),
        new THREE.Vector3(-0.1, -0.2, 0),
        // Lower loop
        new THREE.Vector3(-0.35, -0.35, 0),
        new THREE.Vector3(-0.2, -0.45, 0),
        new THREE.Vector3(0.1, -0.45, 0),
        new THREE.Vector3(0.3, -0.3, 0),
        new THREE.Vector3(0.2, -0.1, 0),
        new THREE.Vector3(-0.05, 0.0, 0),
        // Diagonal tail going upper-right
        new THREE.Vector3(0.2, 0.2, 0),
        new THREE.Vector3(0.3, 0.35, 0),
        // Close back to upper-left to complete the glyph
        new THREE.Vector3(0.1, 0.45, 0),
        new THREE.Vector3(-0.05, 0.4, 0),
    ]
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
}

export class NeonAmpersandSign {
    public readonly mesh: THREE.Group

    private readonly light: THREE.PointLight | null

    constructor(config: NeonAmpersandConfig) {
        const { color, position, scale = 1.0, addLight = true } = config

        const curve = buildAmpersandCurve()

        const tubeGeo = new THREE.TubeGeometry(
            curve,
            128,   // tubularSegments — keep path smooth
            0.025, // radius of the tube itself (thin neon tube)
            8,     // radialSegments — low poly, neon tubes are round not detailed
            false
        )

        const mat = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(color),
            emissiveIntensity: 2.0,
            roughness: 0.3,
            metalness: 0.0,
        })

        const tube = new THREE.Mesh(tubeGeo, mat)

        this.mesh = new THREE.Group()
        this.mesh.add(tube)
        this.mesh.position.copy(position)
        this.mesh.scale.setScalar(scale)

        // PointLight for environmental glow — more reliable than bloom in XR
        if (addLight) {
            this.light = new THREE.PointLight(color, 1.5, 2.0)
            this.light.position.set(0, 0, 0)
            this.mesh.add(this.light)
        } else {
            this.light = null
        }
    }

    /** Remove from scene and dispose GPU resources */
    public dispose(): void {
        this.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                if (Array.isArray(child.material)) {
                    child.material.forEach((m) => m.dispose())
                } else {
                    child.material.dispose()
                }
            }
        })
    }
}
