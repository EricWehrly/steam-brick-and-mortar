/**
 * NeonTubeSignRenderer
 *
 * ISignRenderer implementation that builds 3D neon-style tube geometry
 * for text signs off the main thread via NeonGeometryWorker.
 *
 * On setSign():
 *   1. Creates a THREE.Group immediately and adds it to the scene.
 *   2. Dispatches geometry build to NeonGeometryWorker (off-thread).
 *   3. On completion, populates the group with TubeGeometry meshes and
 *      emits LightingEventTypes.PointLightRequested.
 *
 * No requestIdleCallback or setTimeout — geometry work runs in a worker.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { LightingEventTypes, type PointLightRequestEvent } from '../../types/LightingEvents'
import { NeonGeometryWorker } from './NeonGeometryWorker'
import type { ISignRenderer, SignRequest } from './ISignRenderer'

const TUBE_RADIUS         = 0.015
const SEGMENTS            = 12
const EMISSIVE_INTENSITY  = 2.5

interface NeonSignEntry {
    group: THREE.Group
    material: THREE.MeshStandardMaterial
    /** Resolves when the worker response has been applied to the group */
    buildPromise: Promise<void>
}

export class NeonTubeSignRenderer implements ISignRenderer {
    static readonly defaults = {
        color:    0xff6600,
        fontSize: 0.3,
    } as const

    private readonly entries = new Map<string, NeonSignEntry>()
    private readonly worker: NeonGeometryWorker

    constructor() {
        this.worker = new NeonGeometryWorker()
    }

    setSign(request: SignRequest, scene: THREE.Scene): THREE.Object3D {
        this.removeSign(request.uniqueIdentifier, scene)

        const style = { ...NeonTubeSignRenderer.defaults, ...(request.style ?? {}) }
        const color = style.color

        const group = new THREE.Group()
        group.position.copy(request.position)
        if (request.facingY !== undefined) group.rotation.y = request.facingY
        if (request.scale   !== undefined) group.scale.setScalar(request.scale)
        scene.add(group)

        const material = new THREE.MeshStandardMaterial({
            color,
            emissive:          new THREE.Color(color),
            emissiveIntensity: EMISSIVE_INTENSITY,
            roughness:         0.1,
            metalness:         0.0,
        })

        // Emit point light immediately — position and color are known now,
        // no need to wait for worker geometry to complete.
        EventManager.getInstance().emit<PointLightRequestEvent>(
            LightingEventTypes.PointLightRequested,
            {
                color,
                intensity: 1.5,
                distance:  2.0,
                position:  group.position.clone(),
                name:      `neon-sign-${request.uniqueIdentifier}`,
            }
        )

        const buildPromise = this.buildGeometry(request, group, material, color, style.fontSize)

        this.entries.set(request.uniqueIdentifier, { group, material, buildPromise })
        return group
    }

    private async buildGeometry(
        request: SignRequest,
        group: THREE.Group,
        material: THREE.MeshStandardMaterial,
        color: number,
        fontSize: number,
    ): Promise<void> {
        const text = request.text ?? ''
        let result: Awaited<ReturnType<NeonGeometryWorker['buildTubes']>>
        try {
            result = await this.worker.buildTubes(text, {
                fontSize,
                tubeRadius: TUBE_RADIUS,
                segments:   SEGMENTS,
            })
        } catch (err) {
            console.error(`[NeonTubeSignRenderer] Worker error for "${request.uniqueIdentifier}":`, err)
            return
        }

        // Worker may have been disposed while the request was in flight
        if (!this.entries.has(request.uniqueIdentifier)) return

        for (const tubePts of result.tubes) {
            const pts3d: THREE.Vector3[] = []
            for (let i = 0; i < tubePts.length; i += 3) {
                pts3d.push(new THREE.Vector3(tubePts[i], tubePts[i + 1], tubePts[i + 2]))
            }
            if (pts3d.length < 2) continue
            const curve   = new THREE.CatmullRomCurve3(pts3d, true)
            const tubeGeo = new THREE.TubeGeometry(curve, pts3d.length * 2, TUBE_RADIUS, 8, true)
            const tubeMesh = new THREE.Mesh(tubeGeo, material)
            tubeMesh.name = `neon-tube-${request.uniqueIdentifier}-${group.children.length}`
            tubeMesh.castShadow = true
            tubeMesh.receiveShadow = true
            group.add(tubeMesh)
        }

    }

    removeSign(uniqueIdentifier: string, scene: THREE.Scene): boolean {
        const entry = this.entries.get(uniqueIdentifier)
        if (!entry) return false
        this.entries.delete(uniqueIdentifier)
        scene.remove(entry.group)
        entry.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose()
                // material is shared — disposed below
            }
        })
        entry.material.dispose()
        return true
    }

    clearAll(scene: THREE.Scene): void {
        for (const uniqueIdentifier of [...this.entries.keys()]) {
            this.removeSign(uniqueIdentifier, scene)
        }
    }

    dispose(scene: THREE.Scene): void {
        this.clearAll(scene)
        this.worker.dispose()
    }
}
