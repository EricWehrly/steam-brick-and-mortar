import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import { InputEventTypes, GameEventTypes, type SceneCanvasClickEvent, type GameSelectedEvent } from '../../types/InteractionEvents'
import { SceneLayer } from '../SceneLayers'
import type { InstanceMetadata } from '../../debug/GameFinder'

export interface SceneClickGameBoxRaycastOptions {
    scene?: THREE.Scene
    camera?: THREE.Camera
    maxDistance?: number
    lineColor?: number
    enableDebugLogs?: boolean
    enableDebugLine?: boolean
    onHit?: (hit: SceneGameBoxHit) => void
}

export interface SceneGameBoxHit {
    name?: string
    appid?: number | string
    point: THREE.Vector3
    distance: number
    object: THREE.Object3D
    instanceId?: number
}

export class SceneClickGameBoxRaycast {
    private readonly sceneOption: THREE.Scene | undefined
    private readonly cameraOption: THREE.Camera | undefined
    private readonly maxDistance: number
    private readonly enableDebugLogs: boolean
    private readonly enableDebugLine: boolean
    private readonly onHit?: (hit: SceneGameBoxHit) => void
    private readonly eventManager: EventManager

    private resolvedScene: THREE.Scene | null = null
    private resolvedCamera: THREE.Camera | null = null

    private readonly raycaster = new THREE.Raycaster()
    private readonly pointer = new THREE.Vector2()
    private readonly direction = new THREE.Vector3()

    private debugLine: THREE.Line | null = null
    private readonly lineGeometry = new THREE.BufferGeometry()
    private readonly lineMaterial: THREE.LineBasicMaterial

    constructor(options: SceneClickGameBoxRaycastOptions) {
        this.sceneOption = options.scene
        this.cameraOption = options.camera
        this.maxDistance = options.maxDistance ?? 10
        this.enableDebugLogs = options.enableDebugLogs ?? false
        this.enableDebugLine = options.enableDebugLine ?? false
        this.onHit = options.onHit
        this.eventManager = EventManager.getInstance()

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: options.lineColor ?? 0xff0000
        })

        // Direct mask: only bit for SceneLayer.Interactable. THREE.Layers.set() always
        // ORs in layer 0 (its implementation is `1 | (1 << channel)`), which would
        // test non-interactable objects and require a redundant post-filter.
        this.raycaster.layers.mask = 1 << SceneLayer.Interactable

        this.eventManager.registerEventHandler<SceneCanvasClickEvent>(
            InputEventTypes.SceneCanvasClick,
            this.handleSceneCanvasClick
        )
    }

    public dispose(): void {
        this.eventManager.deregisterEventHandler<SceneCanvasClickEvent>(
            InputEventTypes.SceneCanvasClick,
            this.handleSceneCanvasClick
        )

        if (this.debugLine && this.resolvedScene) {
            this.resolvedScene.remove(this.debugLine)
            this.debugLine = null
        }

        this.lineGeometry.dispose()
        this.lineMaterial.dispose()
    }

    private readonly handleSceneCanvasClick = (event: CustomEvent<SceneCanvasClickEvent>): void => {
        const { button, ndcX, ndcY } = event.detail

        if (button !== 0) {
            return
        }

        // Lazy-resolve scene/camera: DataManager may not be populated at construction time
        const dm = DataManager.getInstance()
        const scene = this.resolvedScene ?? (this.sceneOption ?? dm.get<THREE.Scene>(DataKey.MainScene) ?? null)
        const camera = this.resolvedCamera ?? (this.cameraOption ?? dm.get<THREE.Camera>(DataKey.MainCamera) ?? null)

        if (!scene || !camera) {
            return
        }

        this.resolvedScene = scene
        this.resolvedCamera = camera

        this.pointer.x = ndcX
        this.pointer.y = ndcY

        this.raycaster.far = this.maxDistance
        this.raycaster.setFromCamera(this.pointer, camera)

        const lineStart = this.raycaster.ray.origin.clone()
        const lineEnd = lineStart.clone().add(this.direction.copy(this.raycaster.ray.direction).multiplyScalar(this.maxDistance))
        if (this.enableDebugLine) {
            this.updateDebugLine(lineStart, lineEnd, scene)
        }

        const intersections = this.raycaster.intersectObjects(scene.children, true)

        let firstGameBoxHit: SceneGameBoxHit | null = null
        for (const intersection of intersections) {
            const hit = this.resolveGameBoxIntersection(intersection, dm)
            if (hit) { firstGameBoxHit = hit; break }
        }

        if (!firstGameBoxHit) {
            if (this.enableDebugLogs) {
                console.log('🎯 [SceneClickGameBoxRaycast] No game box hit', { maxDistance: this.maxDistance })
            }
            return
        }

        this.highlightHit(firstGameBoxHit)
        this.onHit?.(firstGameBoxHit)
    }

    private updateDebugLine(start: THREE.Vector3, end: THREE.Vector3, scene: THREE.Scene): void {
        this.lineGeometry.setFromPoints([start, end])

        if (!this.debugLine) {
            this.debugLine = new THREE.Line(this.lineGeometry, this.lineMaterial)
            this.debugLine.name = 'scene-click-raycast-debug-line'
            scene.add(this.debugLine)
        }
    }

    private resolveGameBoxIntersection(intersection: THREE.Intersection<THREE.Object3D>, dm: DataManager): SceneGameBoxHit | null {
        const object = intersection.object

        if (intersection.instanceId !== undefined) {
            const artworkMetadata = dm.get<Map<number, InstanceMetadata>>(DataKey.InstancedArtworkMetadata)
            const artworkHit = artworkMetadata?.get(intersection.instanceId)
            if (artworkHit) {
                return {
                    name: artworkHit.name,
                    appid: artworkHit.appid,
                    point: intersection.point.clone(),
                    distance: intersection.distance,
                    object,
                    instanceId: intersection.instanceId
                }
            }

            const labelMetadata = dm.get<Map<number, { name: string; position: THREE.Vector3 }>>(DataKey.InstancedLabelMetadata)
            const labelHit = labelMetadata?.get(intersection.instanceId)
            if (labelHit) {
                return {
                    name: labelHit.name,
                    point: intersection.point.clone(),
                    distance: intersection.distance,
                    object,
                    instanceId: intersection.instanceId
                }
            }

            return {
                point: intersection.point.clone(),
                distance: intersection.distance,
                object,
                instanceId: intersection.instanceId
            }
        }

        if (object.userData?.isGameBox) {
            return {
                name: object.userData?.name ?? object.name,
                appid: object.userData?.appid,
                point: intersection.point.clone(),
                distance: intersection.distance,
                object
            }
        }

        return null
    }

    private highlightHit(hit: SceneGameBoxHit): void {
        const appid = hit.appid

        // Always log the resolved hit so appid is visible in console during development.
        // Remove or gate on enableDebugLogs once raycast is stable.
        console.warn(`[Raycast] hit: name="${hit.name ?? '?'}" appid=${appid ?? 'none'} instanceId=${hit.instanceId ?? '?'} mesh="${hit.object.name}"`)

        if (appid !== undefined) {
            this.eventManager.emit<GameSelectedEvent>(GameEventTypes.Selected, {
                appid
            })
        } else if (this.enableDebugLogs) {
            console.log('🎯 [SceneClickGameBoxRaycast] Hit had no appid metadata', {
                instanceId: hit.instanceId
            })
        }

        if (this.enableDebugLogs) {
            console.log('🎯 [SceneClickGameBoxRaycast] Hit game box', {
                name: hit.name,
                appid: hit.appid,
                distance: hit.distance,
                instanceId: hit.instanceId
            })
        }
    }

}
