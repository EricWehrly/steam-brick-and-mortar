/**
 * LiminalEvents
 *
 * Event types meaningful only within liminal mode itself. The generic
 * capability-request events its treadmill drives — ShelfUnitRepositionRequested,
 * PlacementRepointRequested — live alongside their siblings in
 * scene/props/PropsEvents.ts and types/InteractionEvents.ts instead: those are
 * consumed by generic renderers (InstancedShelfRenderer, GpuGameBoxRenderer)
 * that have no reason to import liminal-specific types.
 */

import type { BaseInteractionEvent } from '../../core/EventManager'

export const LiminalEventTypes = {
    BoundaryCrossed: 'liminal:boundary-crossed',
} as const

/** Emitted by LiminalBoundaryTracker once per depth-slot boundary the player crosses. */
export interface BoundaryCrossedEvent extends BaseInteractionEvent {
    direction: 'forward' | 'backward'
}
