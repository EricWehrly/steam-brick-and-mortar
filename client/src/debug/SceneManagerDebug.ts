/**
 * SceneManagerDebug — drop-in replacement for SceneManager with debug capabilities.
 *
 * Follows the same pattern as ThreeWebGLRendererDebug: extend the production class,
 * swap the constructor call site (SteamBrickAndMortarApp), no other changes needed.
 *
 * Exposes on window:
 *   window.sceneManager.drawCallReport() → DrawCallReport
 */

import * as THREE from 'three'
import { SceneManager, type SceneManagerOptions } from '../scene/SceneManager'

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

export class SceneManagerDebug extends SceneManager {
    constructor(options: SceneManagerOptions = {}) {
        super(options)
        this.attachToWindow()
    }

    /**
     * Walk the scene graph and extract draw call info from renderer.info.
     * Returns a snapshot — call once after scene is ready for a stable report.
     */
    drawCallReport(): DrawCallReport {
        const renderer = this.getRenderer()
        const scene = this.getScene()
        const rendererInfo = renderer.info

        const objects: DrawCallObject[] = []
        scene.traverse((obj: THREE.Object3D) => {
            const mesh = obj as THREE.Mesh | THREE.InstancedMesh | THREE.Line | THREE.Points
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

        return {
            timestamp: new Date().toISOString(),
            renderer: {
                calls: rendererInfo.render?.calls ?? 0,
                triangles: rendererInfo.render?.triangles ?? 0,
                points: rendererInfo.render?.points ?? 0,
                lines: rendererInfo.render?.lines ?? 0,
                programs: rendererInfo.programs?.length ?? 0,
                geometries: rendererInfo.memory?.geometries ?? 0,
                textures: rendererInfo.memory?.textures ?? 0,
            },
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

/**
 * Format a DrawCallReport as a markdown string.
 * Extracted here so both the Playwright test and any other consumer
 * can use the same canonical representation.
 */
export function drawCallReportToMarkdown(report: DrawCallReport): string {
    const lines: string[] = []
    lines.push('# Draw Call Report')
    lines.push('')
    lines.push(`**Captured:** ${report.timestamp}`)
    lines.push('')

    if (report.renderer) {
        const r = report.renderer
        lines.push('## Renderer Summary')
        lines.push('')
        lines.push('| Metric | Value |')
        lines.push('|--------|-------|')
        lines.push(`| Draw Calls | ${r.calls} |`)
        lines.push(`| Triangles | ${r.triangles.toLocaleString()} |`)
        lines.push(`| Points | ${r.points} |`)
        lines.push(`| Lines | ${r.lines} |`)
        lines.push(`| Shader Programs | ${r.programs} |`)
        lines.push(`| Geometries | ${r.geometries} |`)
        lines.push(`| Textures | ${r.textures} |`)
        lines.push('')
    } else {
        lines.push('> \u26a0\ufe0f renderer.info not available')
        lines.push('')
    }

    lines.push('## Scene Objects')
    lines.push('')
    if (report.objects.length > 0) {
        lines.push('| Name | Type | Visible | Instances | Triangles | Material |')
        lines.push('|------|------|---------|-----------|-----------|----------|')
        for (const obj of report.objects) {
            lines.push(`| ${obj.name} | ${obj.type} | ${obj.visible ? '\u2713' : '\u2717'} | ${obj.instanceCount ?? '\u2014'} | ${obj.triangles.toLocaleString()} | ${obj.material ?? '?'} |`)
        }
    } else {
        lines.push('> \u26a0\ufe0f No scene objects found.')
    }

    return lines.join('\n')
}
