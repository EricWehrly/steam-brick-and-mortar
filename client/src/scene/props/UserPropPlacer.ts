import * as THREE from 'three'
import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import { AssetLoader } from '../AssetLoader'
import { StorePropsEventTypes, type UserPropGlbReadyEvent, type ShelfReadyEvent } from './PropsEvents'
import { UIEventTypes } from '../../types/InteractionEvents'
import { DEFAULT_SHELF_CONFIG } from './shared/SharedPropsTypes'
import modelPosesData from './model-poses.json'

interface BoneRotationDeltaDeg {
    readonly bone: string
    readonly x?: number
    readonly y?: number
    readonly z?: number
    // Opt-in per bone: set rotation to exactly (x, y, z) instead of adding to rest pose.
    // Default (additive) is still correct for most bones — this exists because at least one
    // bone's rest pose carries stray rotation on axes we're not posing, which the additive
    // model can't clear without an explicit override. Confirm live via posePropBone() before
    // flipping this; it discards whatever rest-pose geometry the additive path preserves.
    readonly absolute?: boolean
}

// Seated (posed) models need a different anchor point than standing props: the shelf-cap
// grounding elsewhere in this file assumes the model's own bounding-box bottom is "the feet,"
// which doesn't hold once a model is bent into a sit pose. Hand-tuned per model, the same way
// bone deltas are — see docs/features/user-prop-folder.md.
interface SeatOffsetMetres {
    readonly y?: number
    readonly z?: number
}

interface ModelPoseConfig {
    readonly legs: readonly BoneRotationDeltaDeg[]
    readonly arms: readonly BoneRotationDeltaDeg[]
    readonly seatOffset?: SeatOffsetMetres
}

interface ShelfAnchor {
    readonly position: THREE.Vector3
    readonly rotationY: number
}

interface PendingShelfProp {
    readonly model: THREE.Group
    readonly box: THREE.Box3 | null
    readonly scale: number
    readonly seatOffset?: SeatOffsetMetres
}

type ShelfEndSide = 'left' | 'right'

export class UserPropPlacer {
    private static readonly logger = Logger.createLogFunctions(UserPropPlacer.name)
    // TODO: use DEFAULT_BOX_HEIGHT directly rather than matching
    // Matched to DEFAULT_BOX_HEIGHT in LodArtworkOrchestrator — props scale to game-box height
    private static readonly TARGET_HEIGHT = 0.3

    // GLBs are exported from Blender in raw SourceIO orientation (Source Engine is
    // Z-up; models come in lying on their back in Three.js/Y-up).
    private static readonly UPRIGHT_ROTATION = new THREE.Euler(Math.PI / 2, 0, 0)
    private static readonly Y_AXIS = new THREE.Vector3(0, 1, 0)

    // Every user prop gets its own shelf (one prop per shelf), placed on top of the shelf
    // unit itself (its side boards run floor-to-ceiling at DEFAULT_SHELF_CONFIG.height —
    // see ShelfGeometryBuilder's SideBoard geometry/offset), not on the topmost interior
    // board where games are stocked. Inset keeps the model from overhanging the corner.
    private static readonly SHELF_END_INSET = 0.15
    // TODO: revisit once dangling legs over the shelf's front edge are worth the fuss
    // (deferred until after the TF2 props land) — for now, depth is just centered between
    // the shelf's two side boards (local Z = 0), matching how those boards are modeled.

    // Shelf choice is weighted, not uniform: "cluttered" should still read as a curated
    // store, not a scattershot one, so placement leans toward the front rows and the
    // shelves nearest the center aisle while leaving every shelf reachable. Higher power
    // = sharper falloff away from front/center; the floor keeps back-row/edge shelves
    // possible instead of unreachable.
    private static readonly FRONT_BIAS_POWER = 2
    private static readonly CENTER_BIAS_POWER = 1.5
    private static readonly MIN_SELECTION_WEIGHT = 0.05

    // With a lot of shelves and few props, straight weighted-random can still cluster two
    // props onto neighboring shelves by chance — this discourages (not forbids) that.
    private static readonly SPREAD_MIN_WEIGHT = 0.05

    // Pose data lives in model-poses.json, not here — it's hand-tuned per-model data (found by
    // testing bone rotations live via posePropBone() in the browser console), not something
    // that varies with the rest of this class's logic. Atlas and P-Body (Portal 2 co-op bots)
    // do NOT share a bone-naming convention, or even a bend axis, despite being built on the
    // same "coop_bots" asset base — both confirmed empirically per-model, not assumed. Values
    // are additive deltas on top of each bone's rest pose (see applyBoneRotationDeltas()),
    // which preserves rest-pose geometry (e.g. hip stance angle) on axes other than the ones
    // listed there.
    private static readonly MODEL_POSES: Record<string, ModelPoseConfig> = modelPosesData

    // Keyed by filename (without extension) for the console diagnostic helpers at the
    // bottom of this file.
    private static readonly placedModels = new Map<string, THREE.Group>()

    // Confirmed necessary, not just tidiness: PropRenderer (which constructs this class) has
    // two legitimate, independent construction sites — LightingRenderer's guarded lazy init
    // and StorePropsCoordinator's own cached instance. Both are singletons themselves, so
    // this settles at exactly 2 PropRenderer instances app-wide, and without this guard,
    // exactly 2 UserPropPlacers, each placing its own full copy of every loaded prop. This
    // is a symptom-level fix — the real question (why does PropRenderer need building twice
    // at all) is tracked on PropRenderer's own TODO and deferred pending a broader restructure.
    // Follows the same getInstance() singleton pattern as PropRenderer itself.
    private static instance: UserPropPlacer | null = null

    private readonly propsGroup: THREE.Group

    private readonly shelfAnchors = new Map<number, ShelfAnchor>()
    private readonly usedShelfIndices = new Set<number>()
    private pendingShelfProps: PendingShelfProp[] = []

    public static getInstance(scene: THREE.Scene): UserPropPlacer {
        if (!UserPropPlacer.instance) {
            UserPropPlacer.instance = new UserPropPlacer(scene)
        }
        return UserPropPlacer.instance
    }

    private constructor(scene: THREE.Scene) {
        this.propsGroup = new THREE.Group()
        this.propsGroup.name = 'UserModelProps'
        scene.add(this.propsGroup)

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.UserPropGlbReady,
            this.handleUserPropGlbReady.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            this.handleShelfReady.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.handleShelfAnchorsInvalidated.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.ArrangementRequested,
            this.handleShelfAnchorsInvalidated.bind(this)
        )
        EventManager.getInstance().registerEventHandler(
            UIEventTypes.LayoutRequested,
            this.handleShelfAnchorsInvalidated.bind(this)
        )
    }

    private handleUserPropGlbReady(event: CustomEvent<UserPropGlbReadyEvent>): void {
        void this.placeModel(event.detail)
    }

    private handleShelfReady(event: CustomEvent<ShelfReadyEvent>): void {
        const { shelfIndex, position, rotationY } = event.detail
        // ShelfLayoutCoordinator emits a contiguous wave per run starting at index 0.
        if (shelfIndex === 0) {
            this.shelfAnchors.clear()
            this.usedShelfIndices.clear()
        }
        this.shelfAnchors.set(shelfIndex, { position: (position as THREE.Vector3).clone(), rotationY })
        this.flushPendingShelfProps()
    }

    private handleShelfAnchorsInvalidated(): void {
        this.shelfAnchors.clear()
        this.usedShelfIndices.clear()
    }

    public static findSkeleton(model: THREE.Group): THREE.Skeleton | null {
        let found: THREE.Skeleton | null = null
        model.traverse((child) => {
            if (!found && child instanceof THREE.SkinnedMesh) {
                found = child.skeleton
            }
        })
        return found
    }

    public static getPlacedModel(name: string): THREE.Group | undefined {
        return UserPropPlacer.placedModels.get(name)
    }

    public static getPlacedModelNames(): string[] {
        return Array.from(UserPropPlacer.placedModels.keys())
    }

    private static keyFor(filename: string): string {
        return filename.replace(/\.glb$/i, '')
    }

    private static getPoseConfig(filename: string): ModelPoseConfig | undefined {
        return UserPropPlacer.MODEL_POSES[UserPropPlacer.keyFor(filename)]
    }

    private static applyPose(model: THREE.Group, pose: ModelPoseConfig): void {
        const skeleton = UserPropPlacer.findSkeleton(model)
        if (!skeleton) return

        UserPropPlacer.applyBoneRotationDeltas(skeleton, pose.legs)
        UserPropPlacer.applyBoneRotationDeltas(skeleton, pose.arms)
    }

    // Relative rotation on top of each bone's existing rest pose. Rest pose carries real
    // geometry (e.g. hip stance-width angle, foot-to-ankle angle) on axes other than the one
    // being posed — zeroing those out (as an earlier absolute-set version did) discarded that
    // geometry and produced a kinked limb, since child bones compensate for the parent's
    // altered orientation.
    private static applyBoneRotationDeltas(skeleton: THREE.Skeleton, deltas: readonly BoneRotationDeltaDeg[]): void {
        for (const delta of deltas) {
            const bone = skeleton.getBoneByName(delta.bone)
            if (!bone) {
                UserPropPlacer.logger.warn(`applyBoneRotationDeltas: bone "${delta.bone}" not found`)
                continue
            }
            const x = THREE.MathUtils.degToRad(delta.x ?? 0)
            const y = THREE.MathUtils.degToRad(delta.y ?? 0)
            const z = THREE.MathUtils.degToRad(delta.z ?? 0)
            if (delta.absolute) {
                bone.rotation.set(x, y, z)
            } else {
                bone.rotation.x += x
                bone.rotation.y += y
                bone.rotation.z += z
            }
        }
    }

    private async placeModel(detail: UserPropGlbReadyEvent): Promise<void> {
        const { url, filename } = detail
        try {
            const model = await AssetLoader.loadModel(url, { enableShadows: true })
            // See docs/features/user-prop-folder.md — animation clips are placeholder stubs
            UserPropPlacer.logger.debug(
                `${filename}: ${model.animations.length} animation clip(s)`,
                model.animations.map(a => a.name)
            )

            const pose = UserPropPlacer.getPoseConfig(filename)
            if (pose) {
                UserPropPlacer.applyPose(model, pose)
            }
            UserPropPlacer.placedModels.set(UserPropPlacer.keyFor(filename), model)

            // Box must be measured upright, not in the raw lying-flat import orientation —
            // the shelf placement below only adds a further Y-axis (yaw) rotation on top of
            // this, which doesn't change vertical extent, so box.min.y stays valid afterward.
            model.rotation.copy(UserPropPlacer.UPRIGHT_ROTATION)
            model.updateMatrixWorld(true)
            const box = new THREE.Box3().setFromObject(model)
            const size = box.getSize(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)
            const hasValidBounds = Number.isFinite(maxDim) && maxDim > 0
            const scale = hasValidBounds ? UserPropPlacer.TARGET_HEIGHT / maxDim : 1
            model.scale.setScalar(scale)

            this.placeOnShelf(model, hasValidBounds ? box : null, scale, pose?.seatOffset)
        } catch (error) {
            UserPropPlacer.logger.warn(`placeModel: failed to load "${filename}"`, error)
        }
    }

    // All user props go on a shelf, one prop per shelf — see docs/features/user-prop-folder.md.
    // Queues whenever no unclaimed shelf is available yet: either no shelf anchors are known
    // at all (GLB load finished before ShelfLayoutCoordinator emitted its first ShelfReady), or
    // every shelf known so far is already claimed (ShelfReady arrives one at a time, so a prop
    // can easily lose the race for the only shelf known when it's placed) — either way it's
    // retried on the next ShelfReady rather than dropped unpositioned.
    private placeOnShelf(model: THREE.Group, box: THREE.Box3 | null, scale: number, seatOffset?: SeatOffsetMetres): void {
        const anchor = this.claimShelfAnchor()
        if (!anchor) {
            this.pendingShelfProps.push({ model, box, scale, seatOffset })
            UserPropPlacer.logger.debug('placeOnShelf: no shelf available yet, queued')
            return
        }
        this.positionModelOnShelf(model, anchor, box, scale, seatOffset)
        this.propsGroup.add(model)
    }

    private flushPendingShelfProps(): void {
        if (this.pendingShelfProps.length === 0) return
        const stillPending: PendingShelfProp[] = []
        for (const pending of this.pendingShelfProps) {
            const anchor = this.claimShelfAnchor()
            if (!anchor) {
                stillPending.push(pending)
                continue
            }
            this.positionModelOnShelf(pending.model, anchor, pending.box, pending.scale, pending.seatOffset)
            this.propsGroup.add(pending.model)
        }
        this.pendingShelfProps = stillPending
    }

    // Position and orientation are both derived from the shelf's own rotationY —
    // the equivalent of parenting the prop to the shelf transform, since shelves are
    // GPU-instanced and have no individual Object3D to literally parent to (see
    // GameBoxUtils.buildStockSurfaces, which does the same for game boxes).
    // Facing matches the Near (player-facing) game-box convention: local +Z, after
    // shelf rotation, points toward the player.
    // Standing props ground on their own bounding-box bottom (the model's local origin
    // isn't reliably "the feet" once scaled/posed). Seated props use seatOffset instead —
    // once a model is bent into a sit pose, its bounding-box bottom is wherever its lowest
    // dangling foot ends up, not its hips, so foot-grounding doesn't land the seat on the
    // shelf; seatOffset.y aligns the hips directly, seatOffset.z nudges depth so dangling
    // feet clear the shelf's edge instead of clipping into it.
    private positionModelOnShelf(
        model: THREE.Group,
        anchor: ShelfAnchor,
        box: THREE.Box3 | null,
        scale: number,
        seatOffset?: SeatOffsetMetres
    ): void {
        const side: ShelfEndSide = Math.random() < 0.5 ? 'left' : 'right'
        const localX = UserPropPlacer.shelfEndLocalX(side)
        const localZ = seatOffset?.z ?? 0
        const verticalOffset = seatOffset?.y ?? (box ? -box.min.y * scale : 0)

        const shelfQuat = new THREE.Quaternion().setFromAxisAngle(UserPropPlacer.Y_AXIS, anchor.rotationY)
        const localOffset = new THREE.Vector3(localX, 0, localZ).applyQuaternion(shelfQuat)

        model.position.set(
            anchor.position.x + localOffset.x,
            anchor.position.y + DEFAULT_SHELF_CONFIG.height + verticalOffset,
            anchor.position.z + localOffset.z,
        )

        const uprightQuat = new THREE.Quaternion().setFromEuler(UserPropPlacer.UPRIGHT_ROTATION)
        model.quaternion.multiplyQuaternions(shelfQuat, uprightQuat)
    }

    // Weighted, not uniform or round-robin: picks among not-yet-used shelves, favoring
    // shelves closer to the front (smaller distance from origin) and closer to the
    // center aisle (smaller angle from straight-ahead), while penalizing shelves close to
    // ones already claimed so a handful of props don't cluster onto neighboring shelves by
    // chance. Works from raw shelf position alone so it isn't tied to the arc layout's own
    // row/indexInRow bookkeeping, which ShelfReadyEvent doesn't carry.
    private claimShelfAnchor(): ShelfAnchor | null {
        const available = Array.from(this.shelfAnchors.entries()).filter(([index]) => !this.usedShelfIndices.has(index))
        if (available.length === 0) return null

        const allAnchors = Array.from(this.shelfAnchors.values())
        const usedAnchors = Array.from(this.usedShelfIndices)
            .map(index => this.shelfAnchors.get(index))
            .filter((anchor): anchor is ShelfAnchor => anchor !== undefined)
        const repulsionRadius = UserPropPlacer.spreadRepulsionRadius(allAnchors)

        const weights = available.map(([, anchor]) =>
            UserPropPlacer.frontCenterWeight(anchor, allAnchors) *
            UserPropPlacer.spreadWeight(anchor, usedAnchors, repulsionRadius)
        )
        const totalWeight = weights.reduce((sum, w) => sum + w, 0)

        let roll = Math.random() * totalWeight
        let chosen = available.length - 1
        for (let i = 0; i < available.length; i++) {
            roll -= weights[i]
            if (roll <= 0) {
                chosen = i
                break
            }
        }

        const [shelfIndex, anchor] = available[chosen]
        this.usedShelfIndices.add(shelfIndex)
        return anchor
    }

    private static frontCenterWeight(anchor: ShelfAnchor, allAnchors: readonly ShelfAnchor[]): number {
        const radiusOf = (a: ShelfAnchor) => Math.hypot(a.position.x, a.position.z)
        const angleOf = (a: ShelfAnchor) => Math.abs(Math.atan2(a.position.x, a.position.z))

        const maxRadius = Math.max(...allAnchors.map(radiusOf), 1e-6)
        const maxAngle = Math.max(...allAnchors.map(angleOf), 1e-6)

        const frontness = 1 - radiusOf(anchor) / maxRadius
        const centerness = 1 - angleOf(anchor) / maxAngle

        return UserPropPlacer.MIN_SELECTION_WEIGHT
            + Math.pow(Math.max(frontness, 0), UserPropPlacer.FRONT_BIAS_POWER)
            * Math.pow(Math.max(centerness, 0), UserPropPlacer.CENTER_BIAS_POWER)
    }

    // Rough average nearest-neighbor spacing for N shelves spread over the layout's own
    // radius, as if evenly distributed over a disk (spacing ~ radius / sqrt(N)). Denser
    // layouts (more shelves for the same floor area) get a smaller radius, so the
    // anti-clustering pressure below scales with how tightly-packed the shelves actually
    // are — this is the "prop:shelf ratio" adaptiveness, expressed spatially rather than
    // as a fixed shelf-index gap, since ShelfReadyEvent doesn't carry row/index bookkeeping.
    private static spreadRepulsionRadius(allAnchors: readonly ShelfAnchor[]): number {
        const maxRadius = Math.max(...allAnchors.map(a => Math.hypot(a.position.x, a.position.z)), 1e-6)
        return maxRadius / Math.sqrt(allAnchors.length)
    }

    // Ramps from SPREAD_MIN_WEIGHT (never zero — an isolated remaining shelf must stay
    // pickable even if it happens to sit near a used one) up to 1 once a candidate is at
    // least one repulsion radius from every already-claimed shelf.
    private static spreadWeight(
        candidate: ShelfAnchor,
        usedAnchors: readonly ShelfAnchor[],
        repulsionRadius: number
    ): number {
        if (usedAnchors.length === 0) return 1
        const nearestUsedDistance = Math.min(...usedAnchors.map(used =>
            Math.hypot(candidate.position.x - used.position.x, candidate.position.z - used.position.z)
        ))
        return Math.min(1, Math.max(UserPropPlacer.SPREAD_MIN_WEIGHT, nearestUsedDistance / repulsionRadius))
    }

    private static shelfEndLocalX(side: ShelfEndSide): number {
        const halfWidth = DEFAULT_SHELF_CONFIG.width / 2
        return side === 'left'
            ? -(halfWidth - UserPropPlacer.SHELF_END_INSET)
            : (halfWidth - UserPropPlacer.SHELF_END_INSET)
    }
}

// ─── Console diagnostics for bone posing ──────────────────────────────────────
// Usage from the browser console:
//   listPropBones('atlas')                       // print every bone name for a placed model
//   posePropBone('atlas', 'L_knee', 0, 0, 80)     // set a bone's LOCAL rotation in degrees (x, y, z)
//   resetPropPose('atlas')                        // zero all bone rotations on a model
//
// Model key is the GLB filename without extension (e.g. "atlas" for atlas.glb).
function listPropBones(name: string): void {
    const model = UserPropPlacer.getPlacedModel(name)
    if (!model) {
        console.warn(`No placed model found for "${name}". Currently placed:`, UserPropPlacer.getPlacedModelNames())
        return
    }
    const skeleton = UserPropPlacer.findSkeleton(model)
    if (!skeleton) {
        console.warn(`No skeleton found on "${name}"`)
        return
    }
    console.log(`${name}: ${skeleton.bones.length} bones`)
    console.table(skeleton.bones.map(b => ({ name: b.name, parent: b.parent?.name ?? '(root)' })))
}

function posePropBone(name: string, boneName: string, xDeg: number, yDeg: number, zDeg: number): void {
    const model = UserPropPlacer.getPlacedModel(name)
    if (!model) {
        console.warn(`No placed model found for "${name}"`)
        return
    }
    const bone = UserPropPlacer.findSkeleton(model)?.getBoneByName(boneName)
    if (!bone) {
        console.warn(`Bone "${boneName}" not found on "${name}"`)
        return
    }
    bone.rotation.set(
        THREE.MathUtils.degToRad(xDeg),
        THREE.MathUtils.degToRad(yDeg),
        THREE.MathUtils.degToRad(zDeg)
    )
    console.log(`${name}.${boneName} rotation set to (${xDeg}°, ${yDeg}°, ${zDeg}°)`)
}

function resetPropPose(name: string): void {
    const model = UserPropPlacer.getPlacedModel(name)
    if (!model) {
        console.warn(`No placed model found for "${name}"`)
        return
    }
    UserPropPlacer.findSkeleton(model)?.bones.forEach(b => b.rotation.set(0, 0, 0))
    console.log(`${name}: all bone rotations reset to zero`)
}

if (typeof window !== 'undefined') {
    (window as unknown as { listPropBones: typeof listPropBones }).listPropBones = listPropBones
    ;(window as unknown as { posePropBone: typeof posePropBone }).posePropBone = posePropBone
    ;(window as unknown as { resetPropPose: typeof resetPropPose }).resetPropPose = resetPropPose
}
