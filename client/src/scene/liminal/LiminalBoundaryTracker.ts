/**
 * LiminalBoundaryTracker
 *
 * Watches the player's depth-slot position while liminal mode is active and
 * emits BoundaryCrossed once per depth-slot boundary crossed, in either
 * direction. Drives LiminalWindowCoordinator's treadmill (Story 5 of
 * docs/plans/liminal-mode-plan.md).
 *
 * Reads the camera straight off DataManager on an infrequent poll rather than
 * coupling to CameraInputApplier/InputManager/WebXRCoordinator — there is no
 * discrete "camera moved" event to hook (CameraInputApplier mutates
 * camera.position imperatively every frame via translateZ/translateX with
 * nothing emitted), and inventing one would add per-frame event-dispatch
 * overhead for no cheaper a cadence than just reading position directly. The
 * frame-skip below is the same technique LodDistanceManager already uses for
 * camera-relative LOD switching — check absolute position every N frames, not
 * every one. Sampling absolute position (not a per-frame delta) means a
 * skipped frame never loses a crossing: however far the player moved between
 * checks, resolveCrossings() below walks every boundary that was passed.
 *
 * Slot boundaries are the midpoints between adjacent depth-slot centers.
 * BOUNDARY_HYSTERESIS_SLOT_FRACTION adds a dead zone against re-crossing the
 * same boundary right after tripping it — continuing in the direction you're
 * already moving trips at the plain midpoint (tight, so new content appears
 * promptly), but reversing direction right at a boundary requires overshooting
 * further (loose), so standing near a boundary can't flicker the corridor back
 * and forth. See the plan's Story 6 for further tuning.
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

/** Frames between position checks once a baseline slot is established (~10/sec at 60fps). */
export const BOUNDARY_CHECK_FRAME_INTERVAL = 6

/**
 * Extra overshoot (as a fraction of one slot's width) required to reverse
 * direction right at a boundary, on top of the plain midpoint. Continuing in
 * the same direction never pays this — only a reversal does.
 */
export const BOUNDARY_HYSTERESIS_SLOT_FRACTION = 0.2

type CrossingDirection = 'forward' | 'backward'

export function computeRawSlotPositionForWorldZ(z: number): number {
    return (-z - CORRIDOR_FIRST_SLOT_OFFSET_Z) / CORRIDOR_UNIT_SPACING_Z
}

export function computeSlotIndexForWorldZ(z: number): number {
    return Math.round(computeRawSlotPositionForWorldZ(z))
}

export class LiminalBoundaryTracker {
    private isLiminalActive = false
    private currentSlotIndex: number | null = null
    private lastCrossingDirection: CrossingDirection | null = null
    private frameCount = 0
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
            this.lastCrossingDirection = null
            this.frameCount = 0
        }
    }

    private onFrame(): void {
        if (!this.isLiminalActive) return

        // Establishing the baseline is a one-off, not a per-frame cost — never
        // throttle it, only the steady-state repeated checks below.
        const isBaselineFrame = this.currentSlotIndex === null
        if (!isBaselineFrame) {
            this.frameCount++
            if (this.frameCount % BOUNDARY_CHECK_FRAME_INTERVAL !== 0) return
        }

        const camera = this.dataManager.get<THREE.Camera>(DataKey.MainCamera)
        if (!camera) return

        const rawSlot = computeRawSlotPositionForWorldZ(camera.position.z)

        if (isBaselineFrame) {
            this.currentSlotIndex = Math.round(rawSlot)
            return
        }

        this.resolveCrossings(rawSlot)
    }

    /**
     * Walks every boundary between the last confirmed slot and rawSlot's
     * current position, one crossing event per boundary — a loop rather than
     * a single comparison because the infrequent check above can see several
     * slots' worth of movement (unusually fast movement, or a longer interval)
     * in one call.
     */
    private resolveCrossings(rawSlot: number): void {
        for (;;) {
            const confirmedSlot = this.currentSlotIndex!
            const forwardHysteresis = this.lastCrossingDirection === 'backward' ? BOUNDARY_HYSTERESIS_SLOT_FRACTION : 0
            const backwardHysteresis = this.lastCrossingDirection === 'forward' ? BOUNDARY_HYSTERESIS_SLOT_FRACTION : 0
            const forwardThreshold = confirmedSlot + 0.5 + forwardHysteresis
            const backwardThreshold = confirmedSlot - 0.5 - backwardHysteresis

            if (rawSlot >= forwardThreshold) {
                this.currentSlotIndex = confirmedSlot + 1
                this.lastCrossingDirection = 'forward'
                this.emitBoundaryCrossed('forward')
            } else if (rawSlot <= backwardThreshold) {
                this.currentSlotIndex = confirmedSlot - 1
                this.lastCrossingDirection = 'backward'
                this.emitBoundaryCrossed('backward')
            } else {
                break
            }
        }
    }

    private emitBoundaryCrossed(direction: CrossingDirection): void {
        EventManager.getInstance().emit<BoundaryCrossedEvent>(LiminalEventTypes.BoundaryCrossed, { direction })
    }

    public dispose(): void {
        RenderLoopRegistry.getInstance().unregister(RENDER_LOOP_ID)
    }
}
