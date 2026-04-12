/**
 * NeonTubeSign
 *
 * 3D neon-style text sign using TubeGeometry along font outline paths.
 * Renders glowing, rounded neon tubing for a realistic appearance.
 *
 * Builds geometry incrementally across idle frames to avoid per-frame hitches.
 * Glow point light is requested via LightingEventTypes.PointLightRequested
 * so the lighting system controls shadow map recalculation timing.
 */

import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { EventManager } from '../core/EventManager'
import { LightingEventTypes, type PointLightRequestEvent } from '../types/LightingEvents'

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
                const shapes = font.generateShapes(text, 0.3)
                const material = new THREE.MeshStandardMaterial({
                    color,
                    emissive: new THREE.Color(color),
                    emissiveIntensity: 2.5,
                    roughness: 0.1,
                    metalness: 0.0,
                })

                // Center offset — compute bounding box across all shapes first
                let minX = Infinity, maxX = -Infinity
                let minY = Infinity, maxY = -Infinity
                for (const shape of shapes) {
                    for (const pt of shape.getPoints(12)) {
                        minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x)
                        minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y)
                    }
                }
                const offsetX = -(minX + maxX) / 2
                const offsetY = -(minY + maxY) / 2

                // Collect all paths upfront (cheap), then build one TubeGeometry per
                // idle slice so no single frame pays the full geometry cost.
                const allPaths: THREE.Vector3[][] = []
                for (const shape of shapes) {
                    for (const path of [shape, ...shape.holes]) {
                        const pts2d = path.getPoints(12)
                        if (pts2d.length < 2) continue
                        allPaths.push(pts2d.map(p => new THREE.Vector3(p.x + offsetX, p.y + offsetY, 0)))
                    }
                }

                // Build one tube per idle callback so each geometry hits a separate frame.
                const buildNext = (index: number) => {
                    if (index >= allPaths.length) {
                        const elapsed = (performance.now() - t0).toFixed(1)
                        console.debug(`[NeonTubeSign] TubeGeometry complete (${allPaths.length} tubes) in ${elapsed}ms total`)

                        // Request point light via event — keeps NeonTubeSign decoupled from LightingRenderer
                        EventManager.getInstance().emit<PointLightRequestEvent>(
                            LightingEventTypes.PointLightRequested,
                            {
                                color,
                                intensity: 1.5,
                                distance: 2.0,
                                position: this.mesh.position.clone(),
                                name: 'neon-tube-sign-glow',
                            }
                        )
                        return
                    }

                    const pts3d = allPaths[index]
                    const curve = new THREE.CatmullRomCurve3(pts3d, true)
                    const tubeGeo = new THREE.TubeGeometry(curve, pts3d.length * 2, 0.015, 8, true)
                    const mesh = new THREE.Mesh(tubeGeo, material)
                    this.mesh.add(mesh)

                    if (typeof requestIdleCallback !== 'undefined') {
                        // eslint-disable-next-line no-undef -- TD: neon-worker-migration
                        requestIdleCallback(() => buildNext(index + 1), { timeout: 2000 })
                    } else {
                        setTimeout(() => buildNext(index + 1), 0)
                    }
                }

                buildNext(0)
            }

            if (typeof requestIdleCallback !== 'undefined') {
                // eslint-disable-next-line no-undef -- TD: neon-worker-migration
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
