/**
 * LiminalBoundaryTracker
 *
 * Watches the player's depth position while liminal mode is active and emits
 * BoundaryCrossed once per depth-slot boundary crossed, in either direction.
 * Drives LiminalWindowCoordinator's treadmill (Story 5 of
 * docs/plans/liminal-mode-plan.md).
 *
 * The camera is grabbed once, at construction (SceneManager has already
 * published it to DataManager by then — the same guarantee RoomManager's
 * constructor already relies on), not re-resolved every check. There's no
 * discrete "camera moved" event to hook instead — CameraInputApplier mutates
 * camera.position imperatively every frame with nothing emitted — and
 * inventing one would add per-frame event-dispatch overhead for no cheaper a
 * cadence than reading the cached reference's .position directly.
 *
 * onFrame samples position every BOUNDARY_CHECK_FRAME_INTERVAL frames
 * (mirrors LodDistanceManager's existing infrequent-check pattern), against
 * two stored world-Z thresholds — forwardTripZ / backwardTripZ — rather than
 * recomputing a slot index and its boundaries from scratch each check.
 * advanceForward()/advanceBackward() are the only place those thresholds
 * move, by a fixed offset each time a boundary actually trips: tight
 * (shift by exactly one slot) in the direction just traveled, so new content
 * appears promptly, but loose (shift out by HYSTERESIS_DISTANCE first) on the
 * opposite threshold, so reversing right at a boundary requires overshooting
 * rather than immediately flickering the corridor back and forth.
 */

import * as THREE from 'three'
import { DataManager } from '../../core/data/DataManager'
import { DataKey } from '../../core/data/DataTypes'
import { EventManager, type BaseInteractionEvent } from '../../core/EventManager'
import { UIEventTypes } from '../../types/InteractionEvents'
import type { LayoutRequestedEvent } from '../../types/EnvironmentEvents'
import { LayoutModes } from '../../types/LayoutTypes'
import { RenderLoopRegistry } from '../RenderLoopRegistry'
import { CORRIDOR_FIRST_SLOT_OFFSET_Z, CORRIDOR_UNIT_SPACING_Z, computeSlotWorldZ } from './LiminalCorridorLayout'

const RENDER_LOOP_ID = 'LiminalBoundaryTracker'

export const LiminalEventTypes = {
    BoundaryCrossed: 'liminal:boundary-crossed',
} as const

/** Emitted once per depth-slot boundary the player crosses. */
export interface BoundaryCrossedEvent extends BaseInteractionEvent {
    direction: 'forward' | 'backward'
}

/** Frames between position checks (~10/sec at 60fps). */
export const BOUNDARY_CHECK_FRAME_INTERVAL = 6

/**
 * Extra overshoot (as a fraction of one slot's width) required to reverse
 * direction right at a boundary, on top of the plain midpoint. Continuing in
 * the same direction never pays this — only a reversal does.
 */
export const BOUNDARY_HYSTERESIS_SLOT_FRACTION = 0.2
const HYSTERESIS_DISTANCE = BOUNDARY_HYSTERESIS_SLOT_FRACTION * CORRIDOR_UNIT_SPACING_Z

export function computeSlotIndexForWorldZ(z: number): number {
    return Math.round((-z - CORRIDOR_FIRST_SLOT_OFFSET_Z) / CORRIDOR_UNIT_SPACING_Z)
}

export class LiminalBoundaryTracker {
    private readonly camera: THREE.Camera
    private isLiminalActive = false
    private hasBaseline = false
    private frameCount = 0

    /** World-Z of the next boundary ahead — crossing it (z decreases past it) advances the window. */
    private forwardTripZ = 0
    /** World-Z of the next boundary behind — crossing it (z rises past it) retreats the window. */
    private backwardTripZ = 0

    constructor() {
        this.camera = DataManager.getInstance().getOrThrow<THREE.Camera>(DataKey.MainCamera)

        EventManager.getInstance().registerEventHandler<LayoutRequestedEvent>(
            UIEventTypes.LayoutRequested,
            this.handleLayoutRequested.bind(this)
        )
        RenderLoopRegistry.getInstance().register(RENDER_LOOP_ID, this.onFrame.bind(this))
    }

    private handleLayoutRequested(event: CustomEvent<LayoutRequestedEvent>): void {
        const wasActive = this.isLiminalActive
        this.isLiminalActive = event.detail.layoutMode === LayoutModes.Liminal

        // Re-establish the baseline on (re)activation instead of comparing
        // against stale trip points from whatever the camera was doing in
        // another layout — that would fire spurious crossings on the very
        // first frame.
        if (this.isLiminalActive && !wasActive) {
            this.hasBaseline = false
            this.frameCount = 0
        }
    }

    private onFrame(): void {
        if (!this.isLiminalActive) return

        // Establishing the baseline is a one-off, not a per-frame cost — never
        // throttle it, only the steady-state repeated checks below.
        if (!this.hasBaseline) {
            this.establishBaseline()
            return
        }

        this.frameCount++
        if (this.frameCount % BOUNDARY_CHECK_FRAME_INTERVAL !== 0) return

        this.resolveCrossings(this.camera.position.z)
    }

    private establishBaseline(): void {
        const nearestSlot = computeSlotIndexForWorldZ(this.camera.position.z)
        this.forwardTripZ = computeSlotWorldZ(nearestSlot + 0.5)
        this.backwardTripZ = computeSlotWorldZ(nearestSlot - 0.5)
        this.hasBaseline = true
    }

    /**
     * Usually resolves to a single crossing; the counts below only exceed 1
     * when the infrequent check above has let several slots' worth of
     * movement (unusually fast movement, or a longer interval) pass between
     * checks. advanceForward()/advanceBackward() always shift their own
     * threshold by exactly one slot width regardless of hysteresis state, so
     * how many boundaries were passed is a plain division, not a search.
     */
    private resolveCrossings(z: number): void {
        if (z <= this.forwardTripZ) {
            const crossings = Math.floor((this.forwardTripZ - z) / CORRIDOR_UNIT_SPACING_Z) + 1
            for (let i = 0; i < crossings; i++) this.advanceForward()
        } else if (z >= this.backwardTripZ) {
            const crossings = Math.floor((z - this.backwardTripZ) / CORRIDOR_UNIT_SPACING_Z) + 1
            for (let i = 0; i < crossings; i++) this.advanceBackward()
        }
    }

    private advanceForward(): void {
        const crossedZ = this.forwardTripZ
        this.forwardTripZ = crossedZ - CORRIDOR_UNIT_SPACING_Z // tight: continuing forward
        this.backwardTripZ = crossedZ + HYSTERESIS_DISTANCE // loose: reversing needs overshoot
        this.emitBoundaryCrossed('forward')
    }

    private advanceBackward(): void {
        const crossedZ = this.backwardTripZ
        this.backwardTripZ = crossedZ + CORRIDOR_UNIT_SPACING_Z // tight: continuing backward
        this.forwardTripZ = crossedZ - HYSTERESIS_DISTANCE // loose: reversing needs overshoot
        this.emitBoundaryCrossed('backward')
    }

    private emitBoundaryCrossed(direction: 'forward' | 'backward'): void {
        EventManager.getInstance().emit<BoundaryCrossedEvent>(LiminalEventTypes.BoundaryCrossed, { direction })
    }

    public dispose(): void {
        RenderLoopRegistry.getInstance().unregister(RENDER_LOOP_ID)
    }
}
