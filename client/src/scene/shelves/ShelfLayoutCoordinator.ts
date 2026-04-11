import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import {
    StorePropsEventTypes,
    GameEventTypes,
    type BatchReadyForPlacementEvent,
    type ShelfReadyEvent,
    type ShelfLayoutDeterminedEvent,
    type StorePropsProgressEvent,
} from '../../types/InteractionEvents'
import { computeArcShelfLayout, type ArcLayoutConfig, type ArcShelfInfo } from '../props/shared/ArcLayoutUtils'

/**
 * ShelfLayoutCoordinator
 *
 * Listens to the first BatchReadyForPlacement event. Uses totalBatches (known
 * immediately) to compute the full arc shelf layout without waiting for game
 * content or sort. Emits:
 *   - ShelfLayoutDetermined  once, with shelfBounds for room/lighting systems
 *   - ShelfReady             one per shelf, with position + rotationY
 *
 * NOTE: ShelfReady is emitted once per BatchReadyForPlacement — progressively
 * as batches arrive. This means 40+ events can fire back-to-back on load.
 * A future ShelfLayoutBatch event could coalesce these if consumers need it.
 *
 * Current assumption: 1 batch ≈ 1 shelf. This holds while shelves have a
 * uniform game-slot count. Wall shelves or variable-capacity shelves will
 * need a separate mapping from batch count → shelf count.
 *
 * Knows nothing about games, GPU, or rendering. Pure layout authority.
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)

    private static readonly FIXED_ROWS_COUNT = 4 + 6 + 10 + 12 // 32 — rows 0–3 with fixed counts

    /** Current assumption: totalBatches maps 1:1 to shelves. See class doc. */

    private layoutComputed = false
    private shelvesByBatch = new Map<number, { position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }>()
    private emittedShelfIds = new Set<number>()
    private totalShelves = 0

    constructor() {
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => this.handleFirstBatch(event.detail)
        )
        ShelfLayoutCoordinator.logger.debug('Subscribed to BatchReadyForPlacement')
    }

    public dispose(): void {
        this.layoutComputed = false
        this.shelvesByBatch.clear()
        this.emittedShelfIds.clear()
        this.totalShelves = 0
    }

    private handleFirstBatch(detail: BatchReadyForPlacementEvent): void {
        if (!this.layoutComputed) {
            this.layoutComputed = true
            this.totalShelves = detail.totalBatches

            if (this.totalShelves === 0) {
                ShelfLayoutCoordinator.logger.warn('totalBatches is 0 — no shelves to lay out')
                return
            }

            ShelfLayoutCoordinator.logger.debug(`Computing arc layout for ${this.totalShelves} shelves`)
            this.computeLayout(this.totalShelves)
        }

        this.emitShelfForBatch(detail.batchIndex)
    }

    private computeLayout(totalShelves: number): void {
        const arcConfig: ArcLayoutConfig = {
            // Only override where we need non-default values; ArcLayoutUtils.DEFAULTS handle the rest.
            shelvesPerRowByRow: [
                4,
                6,
                10,
                12,
                Math.max(1, totalShelves - ShelfLayoutCoordinator.FIXED_ROWS_COUNT),
            ],
            halfAngleByRow: [
                Math.PI / 3.5,
                Math.PI / 3.5,
                Math.PI / 3,
                Math.PI / 3,
                Math.PI / 2.6,
            ],
            minShelfGap: 1.0,
            rowRadiusStep: 4.0,
            firstRowRadius: 5.5,
        }

        const shelves = computeArcShelfLayout(totalShelves, arcConfig)

        // Compute spatial bounds for room/lighting systems
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        // Use shelf width/depth from ArcLayoutUtils defaults rather than duplicating them here
        const hw = 2.0 / 2  // default shelfWidthMetres / 2
        const hd = 1.0 / 2  // default shelfDepth / 2
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
                    // shelvesPerRow omitted — it varies by row; consumers should not rely on it
                },
            }
        )

        this.shelvesByBatch.clear()
        for (let i = 0; i < shelves.length; i++) {
            const s: ArcShelfInfo = shelves[i]
            this.shelvesByBatch.set(i, {
                position: s.position.clone(),
                rotationY: s.rotationY,
                row: s.row,
                indexInRow: s.indexInRow,
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

        // Emit progress synchronously so the progress bar updates immediately.
        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: batchIndex + 1,
            total: this.totalShelves,
            detail: `Placing shelf ${batchIndex + 1}`,
        })

        // Defer ShelfReady to the next microtask.
        // ShelfReady fires inside the BatchReadyForPlacement dispatch;
        // GameBoxSpawner's BatchReadyForPlacement handler hasn't run yet at that point.
        // queueMicrotask ensures all BatchReadyForPlacement handlers complete first,
        // so GameBoxSpawner has stored the pending games before ShelfReady arrives.
        queueMicrotask(() => {
            EventManager.getInstance().emit<ShelfReadyEvent>(
                StorePropsEventTypes.ShelfReady,
                {
                    batchIndex,
                    position: shelf.position.clone(),
                    rotationY: shelf.rotationY,
                    rowIndex: shelf.row,
                }
            )
        })
    }
}
