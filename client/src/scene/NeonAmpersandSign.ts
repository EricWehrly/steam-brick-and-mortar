/**
 * NeonAmpersandSign
 *
 * Spike: 3D neon-style "&" sign using TubeGeometry + CatmullRomCurve3.
 * Intended for category divider signage in the store.
 *
 * Status: prototype ΓÇö not wired into scene yet.
 * See docs/plans/neon-sign-3d-design.md for integration notes.
 *
 * Visual approach:
 * - TubeGeometry traces the ampersand glyph via control points
 * - MeshStandardMaterial with high emissive for neon glow
 * - Optional PointLight at center for environmental bloom without PostProcessing
 */

import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

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

export class NeonAmpersandSign {
    public readonly mesh: THREE.Group

    constructor(config: NeonAmpersandConfig) {
        const { color, position, scale = 1.0, addLight = true } = config

        this.mesh = new THREE.Group()
        this.mesh.position.copy(position)
        this.mesh.scale.setScalar(scale)

        const loader = new FontLoader()
        // TD: if more signs are added consider ManagedWorker for batch font rasterization
        loader.load('/fonts/helvetiker_bold.typeface.json', (font) => {
            const geometry = new TextGeometry('steam', {
                font,
                size: 0.3,
                depth: 0.05,
                curveSegments: 8,
                bevelEnabled: true,
                bevelThickness: 0.01,
                bevelSize: 0.008,
                bevelSegments: 3,
            })

            geometry.center()

            const material = new THREE.MeshStandardMaterial({
                color,
                emissive: new THREE.Color(color),
                emissiveIntensity: 2.0,
                roughness: 0.3,
                metalness: 0.0,
            })

            const textMesh = new THREE.Mesh(geometry, material)
            this.mesh.add(textMesh)

            // PointLight for environmental glow — more reliable than bloom in XR
            if (addLight) {
                const light = new THREE.PointLight(color, 1.5, 2.0)
                light.position.set(0, 0, 0)
                this.mesh.add(light)
            }
        })
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
