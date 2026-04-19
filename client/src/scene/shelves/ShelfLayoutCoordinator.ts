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
import { computeSpokeShelfLayout } from '../props/shared/SpokeLayoutUtils'
import { computeRowShelfLayout } from '../props/shared/RowLayoutUtils'
import { ArcStockStrategy, RowStockStrategy, SpokeStockStrategy, type IStockStrategy } from '../props/shared/StockStrategy'
import { type LayoutMode } from '../../types/LayoutTypes'

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

    /** The stock strategy matching the current layout mode. Consumed by GameBoxSpawner. */
    public readonly stockStrategy: IStockStrategy

    /** Current assumption: totalBatches maps 1:1 to shelves. See class doc. */

    private layoutComputed = false
    private shelvesByBatch = new Map<number, { position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }>()
    private emittedShelfIds = new Set<number>()
    private totalShelves = 0
    private readonly layoutMode: LayoutMode

    private readonly boundHandleFirstBatch: (event: CustomEvent<BatchReadyForPlacementEvent>) => void

    constructor(layoutMode: LayoutMode = 'arc') {
        this.layoutMode = layoutMode
        this.stockStrategy = ShelfLayoutCoordinator.strategyFor(layoutMode)
        this.boundHandleFirstBatch = (event: CustomEvent<BatchReadyForPlacementEvent>) =>
            this.handleFirstBatch(event.detail)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleFirstBatch
        )
        ShelfLayoutCoordinator.logger.debug('Subscribed to BatchReadyForPlacement')
    }

    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleFirstBatch
        )
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

            ShelfLayoutCoordinator.logger.debug(`Computing ${this.layoutMode} layout for ${this.totalShelves} shelves`)
            this.computeLayout(this.totalShelves)
        } else if (detail.totalBatches !== this.totalShelves) {
            // New load with different batch count (e.g. anonymous → real user).
            // Reset and recompute so all batches get valid shelf positions.
            ShelfLayoutCoordinator.logger.debug(
                `Batch count changed (${this.totalShelves} → ${detail.totalBatches}) — resetting layout`
            )
            this.dispose()
            this.layoutComputed = true
            this.totalShelves = detail.totalBatches
            this.computeLayout(this.totalShelves)
        }

        this.emitShelfForBatch(detail.batchIndex)
    }

    private static strategyFor(layoutMode: LayoutMode): IStockStrategy {
        switch (layoutMode) {
            case 'spoke': return new SpokeStockStrategy()
            case 'row':   return new RowStockStrategy()
            case 'arc':
            default:      return new ArcStockStrategy()
        }
    }

    private computeLayout(totalShelves: number): void {
        const shelves = this.layoutMode === 'spoke'
            ? this.computeSpokeLayout()
            : this.layoutMode === 'row'
                ? this.computeRowLayout(totalShelves)
                : this.computeArcLayout(totalShelves)

        // Compute spatial bounds for room/lighting systems
        const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
        const hw = 2.0 / 2
        const hd = 1.0 / 2
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
            const s = shelves[i]
            this.shelvesByBatch.set(i, {
                position: s.position.clone(),
                rotationY: s.rotationY,
                row: 'row' in s ? (s as ArcShelfInfo).row : i,
                indexInRow: 'indexInRow' in s ? (s as ArcShelfInfo).indexInRow : i,
            })
        }

        ShelfLayoutCoordinator.logger.debug(`Layout determined for ${shelves.length} shelves`)
    }

    private computeArcLayout(totalShelves: number): ArcShelfInfo[] {
        const arcConfig: ArcLayoutConfig = {
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
        return computeArcShelfLayout(totalShelves, arcConfig)
    }

    private computeRowLayout(totalShelves: number): Array<{ position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }> {
        return computeRowShelfLayout(totalShelves)
    }

    private computeSpokeLayout(): Array<{ position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }> {
        const spokeShelfInfos = computeSpokeShelfLayout()
        return spokeShelfInfos.map((s, i) => ({
            position: s.position,
            rotationY: s.rotationY,
            row: s.spokeIndex,
            indexInRow: i,
        }))
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
                }
            )
        })
    }
}
