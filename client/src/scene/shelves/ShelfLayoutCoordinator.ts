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
import type { IStockStrategy } from '../props/shared/StockStrategy'
import { LayoutRegistry } from '../props/shared/LayoutRegistry'
import { type LayoutMode } from '../../types/LayoutTypes'

/**
 * ShelfLayoutCoordinator
 *
 * Singleton coordinator — owns shelf layout computation for the lifetime of the app.
 * On layout switch, call reset(newLayoutMode) rather than dispose+reconstruct.
 *
 * Listens to BatchReadyForPlacement. Uses totalBatches to compute the full shelf
 * layout without waiting for game content or sort. Emits:
 *   - ShelfLayoutDetermined  once per layout, with shelfBounds for room/lighting
 *   - ShelfReady             one per shelf, with position + rotationY
 *
 * Knows nothing about games, GPU, or rendering. Pure layout authority.
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)
    private static instance: ShelfLayoutCoordinator | null = null

    /** The stock strategy matching the current layout mode. Consumed by GameBoxSpawner. */
    public stockStrategy: IStockStrategy

    private layoutMode: LayoutMode
    private layoutComputed = false
    private shelvesByBatch = new Map<number, { position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }>()
    private emittedShelfIds = new Set<number>()
    private totalShelves = 0

    private readonly boundHandleFirstBatch: (event: CustomEvent<BatchReadyForPlacementEvent>) => void

    static getInstance(initialLayoutMode: LayoutMode = 'arc'): ShelfLayoutCoordinator {
        if (!ShelfLayoutCoordinator.instance) {
            ShelfLayoutCoordinator.instance = new ShelfLayoutCoordinator(initialLayoutMode)
        }
        return ShelfLayoutCoordinator.instance
    }

    private constructor(layoutMode: LayoutMode) {
        this.layoutMode = layoutMode
        this.stockStrategy = LayoutRegistry[layoutMode].createStockStrategy()
        this.boundHandleFirstBatch = (event: CustomEvent<BatchReadyForPlacementEvent>) =>
            this.handleFirstBatch(event.detail)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleFirstBatch
        )
        ShelfLayoutCoordinator.logger.debug(`Constructed in ${layoutMode} mode`)
    }

    /**
     * Switch to a new layout mode and clear accumulated layout state.
     * Event handler registration is preserved — no re-subscribe needed.
     */
    public reset(layoutMode: LayoutMode = this.layoutMode): void {
        this.layoutMode = layoutMode
        this.stockStrategy = LayoutRegistry[layoutMode].createStockStrategy()
        this.layoutComputed = false
        this.shelvesByBatch.clear()
        this.emittedShelfIds.clear()
        this.totalShelves = 0
        ShelfLayoutCoordinator.logger.debug(`Reset to ${layoutMode} mode`)
    }

    /** Full teardown — deregisters handler. Only needed at app shutdown. */
    public dispose(): void {
        EventManager.getInstance().deregisterEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleFirstBatch
        )
        this.reset()
        ShelfLayoutCoordinator.instance = null
        ShelfLayoutCoordinator.logger.debug('Disposed')
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
            ShelfLayoutCoordinator.logger.debug(
                `Batch count changed (${this.totalShelves} → ${detail.totalBatches}) — resetting layout`
            )
            this.reset(this.layoutMode)
            this.layoutComputed = true
            this.totalShelves = detail.totalBatches
            this.computeLayout(this.totalShelves)
        }

        this.emitShelfForBatch(detail.batchIndex)
    }

    private computeLayout(totalShelves: number): void {
        const shelves = LayoutRegistry[this.layoutMode].computeShelves(totalShelves)

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
                },
            }
        )

        this.shelvesByBatch.clear()
        for (let i = 0; i < shelves.length; i++) {
            const s = shelves[i]
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

        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: batchIndex + 1,
            total: this.totalShelves,
            detail: `Placing shelf ${batchIndex + 1}`,
        })

        // Defer to next microtask so all BatchReadyForPlacement handlers complete
        // before ShelfReady fires — GameBoxSpawner must have stored its pending games first.
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
