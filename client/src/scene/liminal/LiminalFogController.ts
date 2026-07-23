/**
 * LiminalFogController
 *
 * Adds distance fog while liminal mode is active; clears it for every other
 * layout. Unlike shelf placement, room sizing, and signage — which need no
 * per-layout branching at all, per docs/plans/liminal-mode-plan.md's "Why the
 * last attempt failed" — fog is a deliberate liminal-only atmospheric choice,
 * not a generic store feature, so a small dedicated toggle here is correct
 * rather than a seam violation.
 *
 * v1 distances are derived from the corridor's own fixed window (Story 1) so
 * fog roughly closes in before the window's far edge. Explicitly a
 * placeholder, not precision-tuned — see the plan's Story 6.
 */

import * as THREE from 'three'
import { EventManager } from '../../core/EventManager'
import { DataManager, DataKey } from '../../core/data'
import { GameEventTypes, type ShelfLayoutDeterminedEvent } from '../../types/InteractionEvents'
import {
    CORRIDOR_FIRST_SLOT_OFFSET_Z,
    CORRIDOR_UNIT_SPACING_Z,
    LIMINAL_DEPTH_SLOTS,
} from './LiminalCorridorLayout'

/** Distance from the player to the farthest depth slot. */
const CORRIDOR_FAR_EXTENT_Z = CORRIDOR_FIRST_SLOT_OFFSET_Z + (LIMINAL_DEPTH_SLOTS - 1) * CORRIDOR_UNIT_SPACING_Z

// Keep the near/mid shelves fully crisp — fog only closes in over the last stretch
// before the window's far edge, then fades out gradually rather than hard-cutting.
const FOG_NEAR_DISTANCE = CORRIDOR_FAR_EXTENT_Z * 0.75
const FOG_FAR_DISTANCE = CORRIDOR_FAR_EXTENT_Z + CORRIDOR_UNIT_SPACING_Z * 2
const FOG_COLOR = 0x707070

export class LiminalFogController {
    private readonly scene: THREE.Scene

    constructor() {
        this.scene = DataManager.getInstance().getOrThrow<THREE.Scene>(DataKey.MainScene)

        EventManager.getInstance().registerEventHandler<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            this.handleShelfLayoutDetermined.bind(this)
        )
    }

    private handleShelfLayoutDetermined(event: CustomEvent<ShelfLayoutDeterminedEvent>): void {
        this.scene.fog = event.detail.layoutMode === 'liminal'
            ? new THREE.Fog(FOG_COLOR, FOG_NEAR_DISTANCE, FOG_FAR_DISTANCE)
            : null
    }
}
