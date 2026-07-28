/**
 * LiminalBoundaryTracker
 *
 * Watches the player's depth-slot position while liminal mode is active and
 * emits BoundaryCrossed once per depth-slot boundary crossed, in either
 * direction. Drives LiminalWindowCoordinator's treadmill (Story 5 of
 * docs/plans/liminal-mode-plan.md).
 *
 * Reads the camera straight off DataManager each frame rather than coupling
 * to CameraInputApplier/InputManager/WebXRCoordinator — the same pattern
 * LodDistanceManager already uses for camera-relative LOD switching.
 *
 * Slot boundaries are the midpoints between adjacent depth-slot centers, so
 * a crossing fires when the player passes the halfway point between two
 * corridor units — not precision-tuned, see the plan's Story 6.
 */

import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager } from '../../core/EventManager'
import { UIEventTypes } from '../../types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../types/EnvironmentEvents'
import { LayoutModes } from '../../types/LayoutTypes'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { LiminalEventTypes, type BoundaryCrossedEvent } from './LiminalEvents'
import { CORRIDOR_FIRST_SLOT_OFFSET_Z, CORRIDOR_UNIT_SPACING_Z } from './LiminalCorridorLayout'

const RENDER_LOOP_ID = 'LiminalBoundaryTracker'

export function computeSlotIndexForWorldZ(z: number): number {
    return Math.round((-z - CORRIDOR_FIRST_SLOT_OFFSET_Z) / CORRIDOR_UNIT_SPACING_Z)
}

export class LiminalBoundaryTracker {
    private isLiminalActive = false
    private currentSlotIndex: number | null = null
    private readonly dataManager: DataManager

    constructor() {
        this.dataManager = DataManager.getInstance()

        EventManager.getInstance().registerEventHandler<LayoutRequestedEvent>(
            UIEventTypes.LayoutRequested,
            this.handleLayoutRequested.bind(this)
        )
        RenderLoopRegistry.getInstance().register(RENDER_LOOP_ID, this.onFrame.bind(this))
    }

    private handleLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        const wasActive = this.isLiminalActive
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal

        // Re-establish the baseline slot on (re)activation instead of comparing
        // against a stale value from whatever the camera was doing in another
        // layout — that would fire spurious crossings on the very first frame.
        if (this.isLiminalActive && !wasActive) {
            this.currentSlotIndex = null
        }
    }

    private onFrame(): void {
        if (!this.isLiminalActive) return

        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) return

        const slotIndex = computeSlotIndexForWorldZ(camera.position.z)

        if (this.currentSlotIndex === null) {
            this.currentSlotIndex = slotIndex
            return
        }

        if (slotIndex > this.currentSlotIndex) {
            for (let i = this.currentSlotIndex; i < slotIndex; i++) {
                this.emitBoundaryCrossed('forward')
            }
        } else if (slotIndex < this.currentSlotIndex) {
            for (let i = this.currentSlotIndex; i > slotIndex; i--) {
                this.emitBoundaryCrossed('backward')
            }
        }

        this.currentSlotIndex = slotIndex
    }

    private emitBoundaryCrossed(direction: 'forward' | 'backward'): void {
        EventManager.getInstance().emit<BoundaryCrossedEvent>(LiminalEventTypes.BoundaryCrossed, { direction })
    }

    public dispose(): void {
        RenderLoopRegistry.getInstance().unregister(RENDER_LOOP_ID)
    }
}
