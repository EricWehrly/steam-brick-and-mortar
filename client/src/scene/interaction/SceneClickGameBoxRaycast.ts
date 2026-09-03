import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import {
    InputEventTypes, GameEventTypes,
    type SceneCanvasClickEvent, type GameSelectedEvent
} from '../../types/InteractionEvents'
import { SceneLayer } from '../SceneLayers'
import { GameFinder } from '../../debug/GameFinder'
import { Logger } from '../../utils/Logger'
import type { XRControllerSource } from '../../webxr/XRControllerManager'
import { InputManager } from '../../input/InputManager'

// Same surface a box's own material/animation could occupy - two coincident hits this close
// together are "the same physical surface," not one genuinely in front of the other. Guards the
// occlusion check below against raycaster float noise between its two passes.
const OCCLUSION_EPSILON = 1e-4

export interface SceneClickGameBoxRaycastOptions {
    scene?: THREE.Scene
    camera?: THREE.Camera
    maxDistance?: number
    lineColor?: number
    enableDebugLine?: boolean
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
    private static readonly logger = Logger.createLogFunctions(SceneClickGameBoxRaycast.name)
    private readonly sceneOption: THREE.Scene | undefined
    private readonly cameraOption: THREE.Camera | undefined
    private readonly maxDistance: number
    private readonly enableDebugLine: boolean
    private readonly eventManager: EventManager

    private resolvedScene: THREE.Scene | null = null
    private resolvedCamera: THREE.Camera | null = null
    private resolvedControllerSource: XRControllerSource | null = null

    private readonly raycaster = new THREE.Raycaster()
    private readonly pointer = new THREE.Vector2()
    private readonly direction = new THREE.Vector3()

    private debugLine: THREE.Line | null = null
    private readonly lineGeometry = new THREE.BufferGeometry()
    private readonly lineMaterial: THREE.LineBasicMaterial

    constructor(options: SceneClickGameBoxRaycastOptions) {
        this.sceneOption = options.scene
        this.cameraOption = options.camera
        this.maxDistance = options.maxDistance ?? 5
        this.enableDebugLine = options.enableDebugLine ?? false
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

        // A summoned game box or the pause menu already owns what a click means - the shelf
        // shouldn't be racing it to open a second box underneath (direct request, 2026-09-02).
        // Asks InputManager rather than tracking menu-open state itself - PR review request,
        // 2026-09-03: "in terms of concept, logic, responsibility this should either be our
        // UIManager or our InputManager... These Input classes should be talking back to those...
        // to facilitate blocking specific inputs for specific interface conditions."
        if (InputManager.getActiveInstance()?.isMenuOpen()) {
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
        this.raycaster.far = this.maxDistance

        // VR: prefer a real controller ray over the click's NDC position when one's available -
        // null outside an active XR session (or before XRControllerManager.setup() has run), so
        // desktop/mouse/gamepad behavior below is unaffected. See docs/plans/vr-support-plan.md.
        const controllerSource = this.resolvedControllerSource ?? dm.get<XRControllerSource>(DataKey.XRControllerSource) ?? null
        this.resolvedControllerSource = controllerSource
        const controllerRay = controllerSource?.getPrimaryControllerRay() ?? null

        if (controllerRay) {
            this.raycaster.ray.origin.copy(controllerRay.origin)
            this.raycaster.ray.direction.copy(controllerRay.direction)
            SceneClickGameBoxRaycast.logger.debug('Using controller ray', {
                origin: controllerRay.origin.toArray(),
                direction: controllerRay.direction.toArray()
            })
        } else {
            this.pointer.x = ndcX
            this.pointer.y = ndcY
            this.raycaster.setFromCamera(this.pointer, camera)
            SceneClickGameBoxRaycast.logger.debug('Using NDC/camera ray (no controller ray available)', { ndcX, ndcY })
        }

        const lineStart = this.raycaster.ray.origin.clone()
        const lineEnd = lineStart.clone().add(this.direction.copy(this.raycaster.ray.direction).multiplyScalar(this.maxDistance))
        if (this.enableDebugLine) {
            this.updateDebugLine(lineStart, lineEnd, scene)
        }

        // Shelf/wall/prop geometry doesn't carry SceneLayer.Interactable (only game-box artwork/
        // label meshes do - see the constructor), so the layer-filtered pass below would find a
        // box straight through a physically nearer, non-interactable occluder - a shelf panel, a
        // wall - if that box happened to be the nearest INTERACTABLE thing on the ray, regardless
        // of what the player can actually see (direct request, 2026-09-02: "rays can go through
        // shelves ... need to only worry about essentially the pixels the player camera can
        // see"). This unfiltered pass finds the nearest surface of ANY kind first, so the
        // interactable pass below can be rejected once it goes past that.
        this.raycaster.layers.enableAll()
        const nearestVisible = this.raycaster.intersectObjects(scene.children, true)[0] ?? null
        this.raycaster.layers.mask = 1 << SceneLayer.Interactable

        const intersections = this.raycaster.intersectObjects(scene.children, true)

        for (const intersection of intersections) {
            // Everything from here on is at least as far, so also at least as occluded - nothing
            // further down the sorted list could be genuinely visible either.
            if (nearestVisible && intersection.distance > nearestVisible.distance + OCCLUSION_EPSILON) {
                break
            }
            const hit = this.resolveGameBoxIntersection(intersection)
            if (hit) {
                this.highlightHit(hit)
                return
            }
        }

        SceneClickGameBoxRaycast.logger.debug('No game box hit', { maxDistance: this.maxDistance })
    }

    private updateDebugLine(start: THREE.Vector3, end: THREE.Vector3, scene: THREE.Scene): void {
        this.lineGeometry.setFromPoints([start, end])

        if (!this.debugLine) {
            this.debugLine = new THREE.Line(this.lineGeometry, this.lineMaterial)
            this.debugLine.name = 'scene-click-raycast-debug-line'
            scene.add(this.debugLine)
        }
    }

    private resolveGameBoxIntersection(intersection: THREE.Intersection<THREE.Object3D>): SceneGameBoxHit | null {
        const object = intersection.object

        if (intersection.instanceId !== undefined) {
            // GameFinder.findByIntersection disambiguates artwork vs label mesh by name,
            // then looks up the appropriate metadata map. instanceId is per-mesh (0..N)
            // so mesh identity must be checked before map lookup.
            const result = GameFinder.findByInstancedObject({ object, instanceId: intersection.instanceId! })
            if (result) {
                return {
                    name: result.name,
                    appid: result.appid,
                    point: intersection.point.clone(),
                    distance: intersection.distance,
                    object,
                    instanceId: intersection.instanceId
                }
            }

            // Fallback: unknown instanced mesh not in our maps
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

        SceneClickGameBoxRaycast.logger.debug(
            `hit: name="${hit.name ?? '?'}" appid=${appid ?? 'none'} instanceId=${hit.instanceId ?? '?'} mesh="${hit.object.name}"`
        )

        if (appid !== undefined) {
            this.eventManager.emit<GameSelectedEvent>(GameEventTypes.Selected, {
                appid,
                point: hit.point
            })
        } else {
            SceneClickGameBoxRaycast.logger.debug('Hit had no appid metadata', {
                instanceId: hit.instanceId
            })
        }
    }

}
