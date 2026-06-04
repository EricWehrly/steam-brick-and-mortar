/**
 * Showcase scene diagnostics.
 *
 * Answers the questions that matter during blank-screen failures:
 *   1. Is the skybox in the scene?
 *   2. Are GPU instanced meshes in the scene?
 *   3. Is the render loop firing?
 *   4. What is the camera looking at?
 *   5. Are any meshes visible / frustum-culled?
 *
 * Exposed on window at app startup:
 *   showcaseDiag()          — full snapshot log
 *   showcaseFrameCount()    — how many frames have rendered since load
 */

import * as THREE from 'three'
import { DataManager } from '../core/data'
import { DataKey } from '../core/data/DataTypes'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'

let frameCount = 0

function tap(): void {
    RenderLoopRegistry.getInstance().register('ShowcaseDiagnostics', () => {
        frameCount++
    })
}

function meshSummary(scene: THREE.Scene): void {
    const allObjects = [] as THREE.Object3D[]
    scene.traverse(o => allObjects.push(o))

    const instanced = allObjects.filter(o => o instanceof THREE.InstancedMesh) as THREE.InstancedMesh[]
    const meshes = allObjects.filter(o => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh))
    const visible = allObjects.filter(o => o.visible)

    console.group('📦 Scene Mesh Summary')
    console.log(`Total objects: ${allObjects.length}  |  Visible: ${visible.length}`)
    console.log(`InstancedMeshes: ${instanced.length}`)
    instanced.forEach(im => {
        console.log(`  ✦ ${im.name || '<unnamed>'} count=${im.count} visible=${im.visible} frustumCulled=${im.frustumCulled}`)
    })
    console.log(`Regular Meshes: ${meshes.length}`)
    meshes.slice(0, 10).forEach(m => {
        console.log(`  • ${m.name || '<unnamed>'} visible=${m.visible}`)
    })
    if (meshes.length > 10) console.log(`  … and ${meshes.length - 10} more`)
    console.groupEnd()
}

function cameraSummary(): void {
    const camera = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera)
    if (!camera) { console.warn('ShowcaseDiag: no camera in DataManager'); return }
    const p = camera.position
    const q = (camera as THREE.PerspectiveCamera).quaternion
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    console.group('🎥 Camera')
    console.log(`Position: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`)
    console.log(`Look dir: (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`)
    console.groupEnd()
}

function skyboxSummary(scene: THREE.Scene): void {
    const bg = scene.background
    console.group('🌌 Skybox')
    if (!bg) {
        console.warn('scene.background is null — skybox not applied')
    } else if (bg instanceof THREE.CubeTexture || bg instanceof THREE.Texture) {
        console.log(`Texture skybox present (uuid: ${bg.uuid.slice(0, 8)})`)
    } else if (bg instanceof THREE.Color) {
        console.log(`Solid color background: #${bg.getHexString()}`)
    } else {
        console.log('Background type:', (bg as any).constructor?.name ?? typeof bg)
    }
    console.groupEnd()
}

export function runShowcaseDiagnostics(): void {
    const scene = DataManager.getInstance().get<THREE.Scene>(DataKey.MainScene)
    if (!scene) {
        console.error('ShowcaseDiag: scene not found in DataManager')
        return
    }

    console.group('🔬 Showcase Diagnostics')
    console.log(`Render frames since load: ${frameCount}`)
    skyboxSummary(scene)
    cameraSummary()
    meshSummary(scene)
    console.groupEnd()
}

export function initShowcaseDiagnostics(): void {
    tap()
    ;(window as any).showcaseDiag = runShowcaseDiagnostics
    ;(window as any).showcaseFrameCount = () => frameCount
}
