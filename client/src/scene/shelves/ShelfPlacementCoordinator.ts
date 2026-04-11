/**
 * ShelfPlacementCoordinator
 *
 * Bridges ShelfReady (physical layout authority) to ShelfCreated (placement signal
 * for GameBoxSpawner + SceneSignManager). Also tracks totalShelves for progress reporting.
 *
 * This is a pure event coordinator — no rendering concerns.
 */

import { EventManager } from '../../core/EventManager'
import {
    StorePropsEventTypes,
    type StorePropsProgressEvent,
    type BatchReadyForPlacementEvent,
    type ShelfCreatedEvent,
    type ShelfReadyEvent,
} from '../../types/InteractionEvents'

export class ShelfPlacementCoordinator {
    private totalShelves = 0

    constructor() {
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.BatchReadyForPlacement,
            (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                if (this.totalShelves === 0) {
                    this.totalShelves = event.detail.totalBatches
                }
            }
        )

        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.ShelfReady,
            (event: CustomEvent<ShelfReadyEvent>) => this.handleShelfReady(event.detail)
        )
    }

    private handleShelfReady(detail: ShelfReadyEvent): void {
        const shelfId = detail.shelfId

        EventManager.getInstance().emit<StorePropsProgressEvent>(StorePropsEventTypes.Progress, {
            step: 'shelves',
            current: shelfId + 1,
            total: this.totalShelves,
            detail: `Placing shelf ${shelfId + 1}`,
        })

        // Defer ShelfCreated emission to the next microtask.
        // ShelfReady fires synchronously inside the BatchReadyForPlacement dispatch;
        // GameBoxSpawner's BatchReadyForPlacement handler hasn't run yet at that point.
        // queueMicrotask lets all BatchReadyForPlacement handlers complete first,
        // so GameBoxSpawner has stored the pending games before ShelfCreated arrives.
        queueMicrotask(() => {
            EventManager.getInstance().emit<ShelfCreatedEvent>(
                StorePropsEventTypes.ShelfCreated,
                {
                    position: detail.position.clone(),
                    batchIndex: shelfId,
                    rowIndex: 0,   // not used downstream — consumers use batchIndex
                    shelfIndex: shelfId,
                    shelfRotationY: detail.rotationY,
                }
            )
        })
    }
}
