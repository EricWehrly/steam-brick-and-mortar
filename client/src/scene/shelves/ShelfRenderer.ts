import * as THREE from 'three'
import { InstancedShelfRenderer } from '../instancing/InstancedShelfRenderer'
import { EventManager } from '../../core/EventManager'
import {
    StorePropsEventTypes,
    type ShelfReadyEvent,
} from '../../types/InteractionEvents'

/**
 * ShelfRenderer
 *
 * Thin coordinator that owns shelf transform placement and ShelfReady emission.
 *
 * Wraps InstancedShelfRenderer for GPU instance writes. Does NOT replicate
 * InstancedShelfRenderer's RendererReady event or readiness tracking —
 * callers should use isReady() / waitUntilReady() directly on the underlying
 * InstancedShelfRenderer if they need to gate on GPU init.
 *
 * Responsibilities:
 * - createShelf(): write Quaternion-converted transform, emit ShelfReady
 * - reset() / dispose(): forward to InstancedShelfRenderer
 *
 * Layout position/rotation calculation stays in GpuStorePropsRenderer
 * until a ShelfLayoutCoordinator is introduced (see plans/gamesort-event-driven-plan.md).
 */
export class ShelfRenderer {
    private readonly instancedShelfRenderer: InstancedShelfRenderer

    constructor(maxShelfUnits = 100) {
        this.instancedShelfRenderer = new InstancedShelfRenderer({ maxShelfUnits })
    }

    public initialize(): Promise<void> {
        return this.instancedShelfRenderer.initialize()
    }

    public isReady(): boolean {
        return this.instancedShelfRenderer.isReady()
    }

    public waitUntilReady(): Promise<void> {
        if (this.isReady()) return Promise.resolve()
        // InstancedShelfRenderer.initialize() already emits RendererReady;
        // poll via isReady() on the next microtask to avoid double-subscribing.
        return new Promise<void>(resolve => {
            const check = () => this.isReady() ? resolve() : setTimeout(check, 16)
            check()
        })
    }

    /**
     * Write a shelf instance transform and emit ShelfReady.
     * Caller must ensure isReady() before calling.
     */
    public createShelf(shelfId: number, position: THREE.Vector3, rotationY: number): void {
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0))
        this.instancedShelfRenderer.setInstance(shelfId, { position, rotation })

        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            { shelfId, position: position.clone(), rotationY }
        )
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
}
