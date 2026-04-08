/**
 * SceneManagerDebug — debug/diagnostic wrapper for SceneManager
 *
 * Attaches debug utilities to `window` so Playwright tests and browser DevTools
 * can call them without DataManager hacks or prod code changes.
 *
 * Pattern mirrors other debug wrappers (ThreeWebGLRendererDebug, GpuMemoryEstimator):
 * instantiate in dev/debug builds; tree-shaken in prod.
 *
 * Exposed on window:
 *   window.sceneManager.drawCallReport() → DrawCallReport
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'

export interface DrawCallObject {
    name: string
    type: 'InstancedMesh' | 'Mesh' | 'Line' | 'Points'
    visible: boolean
    instanceCount: number | null
    triangles: number
    material: string | null
}

export interface DrawCallReport {
    timestamp: string
    renderer: {
        calls: number
        triangles: number
        points: number
        lines: number
        programs: number
        geometries: number
        textures: number
    } | null
    objects: DrawCallObject[]
}

export class SceneManagerDebug {
    constructor() {
        this.attachToWindow()
    }

    /**
     * Walk the scene graph and extract draw call info from renderer.info.
     * Returns a snapshot — call once after scene is ready for a stable report.
     */
    drawCallReport(): DrawCallReport {
        const dm = DataManager.getInstance()
        const renderer = dm.get<THREE.WebGLRenderer>(DataKey.Renderer) ?? null
        const scene = dm.get<THREE.Scene>(DataKey.MainScene) ?? null

        const rendererInfo = renderer?.info ?? null
        const objects: DrawCallObject[] = []

        if (scene) {
            scene.traverse((obj: THREE.Object3D) => {
                const mesh = obj as THREE.Mesh | THREE.InstancedMesh | THREE.Line | THREE.Points
                if (!('isMesh' in mesh || 'isLine' in mesh || 'isPoints' in mesh)) return

                const isMesh = (mesh as THREE.Mesh).isMesh
                const isInstanced = (mesh as THREE.InstancedMesh).isInstancedMesh
                const isLine = (mesh as THREE.Line).isLine
                const isPoints = (mesh as THREE.Points).isPoints

                if (!isMesh && !isLine && !isPoints) return

                const geo = mesh.geometry as THREE.BufferGeometry | undefined
                const mat = (mesh as THREE.Mesh).material as THREE.Material | undefined
                const rawTriangles = geo?.index
                    ? geo.index.count / 3
                    : (geo?.attributes?.position?.count ?? 0) / 3
                const instanceCount = isInstanced ? (mesh as THREE.InstancedMesh).count : null
                const triangles = Math.round(rawTriangles * (instanceCount ?? 1))

                objects.push({
                    name: mesh.name || '(unnamed)',
                    type: isInstanced ? 'InstancedMesh' : isLine ? 'Line' : isPoints ? 'Points' : 'Mesh',
                    visible: mesh.visible,
                    instanceCount,
                    triangles,
                    material: mat?.type ?? null,
                })
            })
        }

        return {
            timestamp: new Date().toISOString(),
            renderer: rendererInfo ? {
                calls: rendererInfo.render?.calls ?? 0,
                triangles: rendererInfo.render?.triangles ?? 0,
                points: rendererInfo.render?.points ?? 0,
                lines: rendererInfo.render?.lines ?? 0,
                programs: rendererInfo.programs?.length ?? 0,
                geometries: rendererInfo.memory?.geometries ?? 0,
                textures: rendererInfo.memory?.textures ?? 0,
            } : null,
            objects,
        }
    }

    private attachToWindow(): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).sceneManager = {
            drawCallReport: () => this.drawCallReport(),
        }
    }
}
