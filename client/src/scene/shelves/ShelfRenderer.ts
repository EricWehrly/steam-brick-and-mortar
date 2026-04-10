import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { StorePropsEventTypes, type ShelfReadyEvent } from '../../types/InteractionEvents'

/**
 * ShelfRenderer
 *
 * Phase 1 (skeleton): emits authoritative shelf readiness transforms.
 * Real shelf mesh/instancing ownership will move here incrementally.
 */
export class ShelfRenderer {
    public emitShelfReady(shelfId: number, position: THREE.Vector3, rotationY: number): void {
        EventManager.getInstance().emit<ShelfReadyEvent>(
            StorePropsEventTypes.ShelfReady,
            {
                shelfId,
                position: position.clone(),
                rotationY
            }
        )
    }
}
