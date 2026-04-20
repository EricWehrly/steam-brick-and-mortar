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
import { LayoutRegistry } from '../props/shared/LayoutRegistry'
import type { LayoutMode } from '../../types/LayoutTypes'

/**
 * ShelfLayoutCoordinator
 *
 * Singleton, non-disposable event coordinator for shelf geometry.
 * It stays alive for app lifetime and derives all run state from incoming batch events.
 */
export class ShelfLayoutCoordinator {
    private static readonly logger = Logger.createLogFunctions(ShelfLayoutCoordinator.name)
    private static instance: ShelfLayoutCoordinator | null = null

    /** Active layout mode. Can be updated by orchestration before the next batch run. */
    public layoutMode: LayoutMode

    private layoutComputed = false
    private shelvesByBatch = new Map<number, { position: THREE.Vector3; rotationY: number; row: number; indexInRow: number }>()
    private emittedShelfIds = new Set<number>()
    private totalShelves = 0
    private computedLayoutMode: LayoutMode | null = null

    private readonly boundHandleFirstBatch: (event: CustomEvent<BatchReadyForPlacementEvent>) => void

static getInstance(initialLayoutMode: LayoutMode = 'arc'): ShelfLayoutCoordinator {
        if (!ShelfLayoutCoordinator.instance) {
            ShelfLayoutCoordinator.instance = new ShelfLayoutCoordinator(initialLayoutMode)
        }
        return ShelfLayoutCoordinator.instance
    }

    private constructor(layoutMode: LayoutMode) {
        this.layoutMode = layoutMode
        this.boundHandleFirstBatch = (event: CustomEvent<BatchReadyForPlacementEvent>) =>
            this.handleFirstBatch(event.detail)
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            this.boundHandleFirstBatch
        )
        ShelfLayoutCoordinator.logger.debug(`Constructed in ${layoutMode} mode`)
    }

    private clearRunState(): void {
        this.layoutComputed = false
        this.shelvesByBatch.clear()
        this.emittedShelfIds.clear()
        this.totalShelves = 0
        this.computedLayoutMode = null
    }

    private handleFirstBatch(detail: BatchReadyForPlacementEvent): void {
        const isNewRun = detail.batchIndex === 0 && this.emittedShelfIds.size > 0
        const batchCountChanged = detail.totalBatches !== this.totalShelves
        const layoutModeChanged = this.computedLayoutMode !== null && this.computedLayoutMode !== this.layoutMode

        if (isNewRun || batchCountChanged || layoutModeChanged || !this.layoutComputed) {
            if (isNewRun || batchCountChanged || layoutModeChanged) {
                this.clearRunState()
            }

            this.layoutComputed = true
            this.totalShelves = detail.totalBatches
            this.computedLayoutMode = this.layoutMode

            if (this.totalShelves === 0) {
                ShelfLayoutCoordinator.logger.warn('totalBatches is 0 — no shelves to lay out')
                return
            }

            ShelfLayoutCoordinator.logger.debug(`Computing ${this.layoutMode} layout for ${this.totalShelves} shelves`)
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
                stockStrategy: LayoutRegistry[this.layoutMode].createStockStrategy(),
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
