import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import {
    StorePropsEventTypes,
    type ShelfPlacementReadyEvent,
    type ShelfReadyEvent,
} from '../../types/InteractionEvents'

/**
 * ShelfRenderer
 *
 * Listens to ShelfPlacementReady events. For each one, writes the GPU
 * instance transform via InstancedShelfRenderer and emits ShelfReady.
 *
 * Knows nothing about arc math, batch indices, or game counts.
 * All placement decisions arrive via event.
 */
export class ShelfRenderer {
    private static readonly logger = Logger.createLogFunctions(ShelfRenderer.name)

    private readonly instancedShelfRenderer: InstancedShelfRenderer

    constructor(maxShelfUnits = 100) {
        this.instancedShelfRenderer = new InstancedShelfRenderer({ maxShelfUnits })

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfPlacementReady,
            (event: CustomEvent<ShelfPlacementReadyEvent>) => this.handleShelfPlacementReady(event.detail)
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

    private handleShelfPlacementReady(detail: ShelfPlacementReadyEvent): void {
        if (!this.isReady()) {
            ShelfRenderer.logger.error(`ShelfPlacementReady for shelf ${detail.shelfId} before GPU ready — skipping`)
            return
        }

        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, detail.rotationY, 0))
        this.instancedShelfRenderer.setInstance(detail.shelfId, {
            position: detail.position as THREE.Vector3,
            rotation,
        })

        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            {
                shelfId: detail.shelfId,
                position: (detail.position as THREE.Vector3).clone(),
                rotationY: detail.rotationY,
            }
        )
    }
}
