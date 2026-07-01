import * as THREE from 'three'
import { Logger } from '../../utils/Logger'
import { EventManager } from '../../core/EventManager'
import { AssetLoader } from '../AssetLoader'
import { StorePropsEventTypes, type UserPropGlbReadyEvent } from './PropsEvents'

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

    private readonly propsGroup: THREE.Group
    private placedCount = 0

    constructor(scene: THREE.Scene) {
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
