import * as THREE from 'three'
import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import { AssetLoader } from '../AssetLoader'
import { StorePropsEventTypes, type UserPropGlbReadyEvent } from './PropsEvents'
import modelPosesData from './model-poses.json'

interface BoneRotationDeltaDeg {
    readonly bone: string
    readonly x?: number
    readonly y?: number
    readonly z?: number
}

interface ModelPoseConfig {
    readonly legs: readonly BoneRotationDeltaDeg[]
    readonly arms: readonly BoneRotationDeltaDeg[]
}

export class UserPropPlacer {
    private static readonly logger = Logger.createLogFunctions(UserPropPlacer.name)
    private static readonly SPACING = 2
    private static readonly GRID_COLS = 5
    // TODO: define some decoration prop class that can drive a placement strategy
    private static readonly ORIGIN = new THREE.Vector3(-4, 0, -4)
    // TODO: use DEFAULT_BOX_HEIGHT directly rather than matching
    // Matched to DEFAULT_BOX_HEIGHT in LodArtworkOrchestrator — props scale to game-box height
    private static readonly TARGET_HEIGHT = 0.3

    // GLBs are exported from Blender in raw SourceIO orientation (Source Engine is
    // Z-up; models come in lying on their back in Three.js/Y-up).
    private static readonly UPRIGHT_ROTATION = new THREE.Euler(Math.PI / 2, 0, 0)

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
    private placedCount = 0

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
    }

    private handleUserPropGlbReady(event: CustomEvent<UserPropGlbReadyEvent>): void {
        void this.placeModel(event.detail)
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

    private static applyPose(model: THREE.Group, filename: string): void {
        const pose = UserPropPlacer.MODEL_POSES[UserPropPlacer.keyFor(filename)]
        if (!pose) return

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
            bone.rotation.x += THREE.MathUtils.degToRad(delta.x ?? 0)
            bone.rotation.y += THREE.MathUtils.degToRad(delta.y ?? 0)
            bone.rotation.z += THREE.MathUtils.degToRad(delta.z ?? 0)
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
            model.rotation.copy(UserPropPlacer.UPRIGHT_ROTATION)
            UserPropPlacer.applyPose(model, filename)
            UserPropPlacer.placedModels.set(UserPropPlacer.keyFor(filename), model)

            model.updateMatrixWorld(true)
            const box = new THREE.Box3().setFromObject(model)
            const size = box.getSize(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)

            const col = this.placedCount % UserPropPlacer.GRID_COLS
            const row = Math.floor(this.placedCount / UserPropPlacer.GRID_COLS)

            if (maxDim > 0) {
                const scale = UserPropPlacer.TARGET_HEIGHT / maxDim
                model.scale.setScalar(scale)
                model.position.set(
                    UserPropPlacer.ORIGIN.x + col * UserPropPlacer.SPACING,
                    -box.min.y * scale,
                    UserPropPlacer.ORIGIN.z + row * UserPropPlacer.SPACING,
                )
            } else {
                model.position.set(
                    UserPropPlacer.ORIGIN.x + col * UserPropPlacer.SPACING,
                    0,
                    UserPropPlacer.ORIGIN.z + row * UserPropPlacer.SPACING,
                )
            }

            this.propsGroup.add(model)
            this.placedCount++
        } catch (error) {
            UserPropPlacer.logger.warn(`placeModel: failed to load "${filename}"`, error)
        }
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
