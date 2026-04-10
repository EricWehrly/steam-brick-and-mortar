import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import {
    StorePropsEventTypes,
    type ShelfSpaceRequestedEvent,
    type ShelfReadyEvent,
} from '../../types/InteractionEvents'

export interface ShelfPlacement {
    position: THREE.Vector3
    rotationY: number
    rowIndex: number
    shelfIndex: number
}

/**
 * ShelfRenderer
 *
 * Sealed shelf rendering coordinator.
 *
 * Self-subscribes to ShelfSpaceRequested. On each request, resolves the
 * placement via the injected layout provider, writes the GPU instance
 * transform, and emits ShelfReady.
 *
 * All layout position / rotation math lives in the caller (GpuStorePropsRenderer).
 * This class knows nothing about batches, rows, or arc math — it only knows
 * how to turn a resolved placement into a GPU write + event.
 */
export class ShelfRenderer {
    private static readonly logger = Logger.createLogFunctions(ShelfRenderer.name)

    private readonly instancedShelfRenderer: InstancedShelfRenderer
    private readonly getPlacement: (batchIndex: number) => ShelfPlacement | undefined

    constructor(
        getPlacement: (batchIndex: number) => ShelfPlacement | undefined,
        maxShelfUnits = 100
    ) {
        this.getPlacement = getPlacement
        this.instancedShelfRenderer = new InstancedShelfRenderer({ maxShelfUnits })

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfSpaceRequested,
            (event: CustomEvent<ShelfSpaceRequestedEvent>) => this.handleShelfSpaceRequested(event.detail.batchIndex)
        )
    }

    public initialize(): Promise<void> {
        return this.instancedShelfRenderer.initialize()
    }

    public isReady(): boolean {
        return this.instancedShelfRenderer.isReady()
    }

    public waitUntilReady(): Promise<void> {
        if (this.isReady()) return Promise.resolve()
        return new Promise<void>(resolve => {
            const check = () => this.isReady() ? resolve() : setTimeout(check, 16)
            check()
        })
    }

    public reset(): void {
        if (this.instancedShelfRenderer.isReady()) {
            this.instancedShelfRenderer.reset()
        }
    }

    public dispose(): void {
        this.instancedShelfRenderer.dispose()
    }

    public getStats() {
        return this.instancedShelfRenderer.getStats()
    }

    private handleShelfSpaceRequested(batchIndex: number): void {
        if (!this.isReady()) {
            ShelfRenderer.logger.error(`ShelfSpaceRequested for batch ${batchIndex} before renderer ready — skipping`)
            return
        }

        const placement = this.getPlacement(batchIndex)
        if (!placement) {
            ShelfRenderer.logger.error(`No placement resolved for batch ${batchIndex} — skipping`)
            return
        }

        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placement.rotationY, 0))
        this.instancedShelfRenderer.setInstance(batchIndex, { position: placement.position, rotation })

        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            {
                shelfId: batchIndex,
                position: placement.position.clone(),
                rotationY: placement.rotationY,
            }
        )
    }
}
