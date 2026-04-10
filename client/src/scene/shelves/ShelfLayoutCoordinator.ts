import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    StorePropsEventTypes,
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
} from '../../types/InteractionEvents'
import { computeArcShelfLayout, type ArcLayoutConfig } from '../props/shared/ArcLayoutUtils'

/**
 * ShelfLayoutCoordinator
 *
 * Listens to the first BatchReadyForPlacement event. Uses totalBatches (known
 * immediately) to compute the full arc shelf layout without waiting for game
 * content or sort. Emits:
 *   - ShelfLayoutDetermined  once, with bounds for room/lighting systems
 *   - ShelfReady             one per shelf, with position + rotationY
 *
 * InstancedShelfRenderer self-subscribes to ShelfReady and handles GPU writes.
 * GpuStorePropsRenderer self-subscribes to ShelfReady and emits ShelfCreated.
 *
 * Knows nothing about games, batches, or GPU. Pure layout authority.
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)

    private static readonly BATCH_SIZE = 18
    private static readonly SHELF_WIDTH = 2.0
    private static readonly SHELF_DEPTH = 1.0
    private static readonly FIXED_ROWS_COUNT = 4 + 6 + 10 + 12 // 32 — row 0–3 fixed

    private layoutComputed = false
    private shelvesByBatch = new Map<number, { position: THREE.Vector3; rotationY: number }>()
    private emittedShelfIds = new Set<number>()

    constructor() {
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => this.handleFirstBatch(event.detail)
        )
        ShelfLayoutCoordinator.logger.debug('Subscribed to BatchReadyForPlacement')
    }

    /** Reset for scene reload — allows layout to be recomputed on next load. */
    public reset(): void {
        this.layoutComputed = false
        this.shelvesByBatch.clear()
        this.emittedShelfIds.clear()
    }

    public dispose(): void {
        this.reset()
    }

    private handleFirstBatch(detail: BatchReadyForPlacementEvent): void {
        if (!this.layoutComputed) {
            this.layoutComputed = true

            const totalShelves = detail.totalBatches
            if (totalShelves === 0) {
                ShelfLayoutCoordinator.logger.warn('totalBatches is 0 — no shelves to lay out')
                return
            }

            ShelfLayoutCoordinator.logger.debug(`Computing arc layout for ${totalShelves} shelves`)
            this.computeLayout(totalShelves)
        }

        this.emitShelfForBatch(detail.batchIndex)
    }

    private computeLayout(totalShelves: number): void {
        const arcConfig: ArcLayoutConfig = {
            rows: 5,
            shelvesPerRow: 10,
            shelvesPerRowByRow: [
                4,
                6,
                10,
                12,
                Math.max(1, totalShelves - ShelfLayoutCoordinator.FIXED_ROWS_COUNT),
            ],
            halfAngle: Math.PI / 3,
            halfAngleByRow: [
                Math.PI / 3.5,
                Math.PI / 3.5,
                Math.PI / 3,
                Math.PI / 3,
                Math.PI / 2.6,
            ],
            minShelfGap: 1.0,
            shelfWidthMetres: 2.0,
            rowRadiusStep: 4.0,
            firstRowRadius: 5.5,
        }

        const shelves = computeArcShelfLayout(totalShelves, arcConfig)

        // Emit bounds for room/lighting systems
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        const hw = ShelfLayoutCoordinator.SHELF_WIDTH / 2
        const hd = ShelfLayoutCoordinator.SHELF_DEPTH / 2
        for (const s of shelves) {
            bounds.minX = Math.min(bounds.minX, s.position.x - hw)
            bounds.maxX = Math.max(bounds.maxX, s.position.x + hw)
            bounds.minZ = Math.min(bounds.minZ, s.position.z - hd)
            bounds.maxZ = Math.max(bounds.maxZ, s.position.z + hd)
        }

        EventManager.getInstance().emit<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            {
                shelfBounds: bounds,
                shelfLayout: {
                    rows: (shelves[shelves.length - 1]?.row ?? 0) + 1,
                    shelvesPerRow: 10,
                },
            }
        )

        this.shelvesByBatch.clear()
        for (let i = 0; i < shelves.length; i++) {
            this.shelvesByBatch.set(i, {
                position: shelves[i].position.clone(),
                rotationY: shelves[i].rotationY,
            })
        }

        ShelfLayoutCoordinator.logger.debug(`Layout determined for ${shelves.length} shelves`) 
    }

    private emitShelfForBatch(batchIndex: number): void {
        if (this.emittedShelfIds.has(batchIndex)) return

        const shelf = this.shelvesByBatch.get(batchIndex)
        if (!shelf) {
            ShelfLayoutCoordinator.logger.warn(`No shelf layout found for batch ${batchIndex}`)
            return
        }

        this.emittedShelfIds.add(batchIndex)
        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            {
                shelfId: batchIndex,
                position: shelf.position.clone(),
                rotationY: shelf.rotationY,
            }
        )
    }
}
