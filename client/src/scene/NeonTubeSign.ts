/**
 * NeonTubeSign
 *
 * Spike: 3D neon-style text sign using TextGeometry + emissive material.
 * Currently renders "steam" — intended for category divider signage in the store.
 *
 * Status: prototype — wired into scene in GpuStorePropsRenderer for review.
 *
 * TODO: more tubey appearance — TubeGeometry along text outline paths instead of
 * ExtrudeGeometry, for proper neon-tube cross-section look.
 * TODO: lighting should go through LightingRenderer event system, not added directly.
 *       For now: no light emitted (avoids shadow map recalculation hitch).
 */

import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import type { LightingRenderer } from './LightingRenderer'

export interface NeonTubeSignConfig {
    /** Hex color integer, e.g. 0xff6600 */
    color: number
    /** World-space position for the sign center */
    position: THREE.Vector3
    /** Uniform scale multiplier (default: 1.0) */
    scale?: number
    /** Text to display (default: 'steam') */
    text?: string
}

export class NeonTubeSign {
    public readonly mesh: THREE.Group

    constructor(config: NeonTubeSignConfig) {
        const { color, position, scale = 1.0, text = 'steam' } = config

        this.mesh = new THREE.Group()
        this.mesh.position.copy(position)
        this.mesh.scale.setScalar(scale)

        const loader = new FontLoader()
        // TD: if more signs are added consider ManagedWorker for batch font rasterization
        loader.load('/fonts/helvetiker_bold.typeface.json', (font) => {
            const buildSign = () => {
                const t0 = performance.now()

                const geometry = new TextGeometry(text, {
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

                // Request a point light via LightingRenderer to avoid direct scene add.
                // Direct scene addition triggers a full shadow map recalculation.
                // requestPointLight queues the request until lighting is ready (SystemReady).
                const lightingRenderer = DataManager.getInstance()
                    .get<LightingRenderer>(DataKey.LightingRenderer)
                if (lightingRenderer) {
                    lightingRenderer.requestPointLight({
                        color,
                        intensity: 1.5,
                        distance: 2.0,
                        // TD: position should match sign world position;
                        // hardcoded for now to avoid recalc on reposition
                        position: this.mesh.position.clone(),
                        name: 'neon-tube-sign-glow',
                    })
                } else {
                    console.warn('[NeonTubeSign] LightingRenderer not in DataManager -- no glow light')
                }

                const elapsed = (performance.now() - t0).toFixed(1)
                console.debug(`[NeonTubeSign] TextGeometry built in ${elapsed}ms`)
            }

            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(buildSign, { timeout: 2000 })
            } else {
                setTimeout(buildSign, 0)
            }
        })
    }

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
