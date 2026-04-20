/**
 * EnvironmentEvents
 *
 * System-to-system pipeline events: batch loading, layout, sort completion.
 * These are not user interaction events — they signal state transitions in the
 * data and rendering pipeline.
 */

import type { BaseInteractionEvent } from '../core/EventManager'
import type { ShelfBounds } from './InteractionEvents'
import type { Section, GroupMode, SortMode, LayoutMode } from './LayoutTypes'

// Re-export GroupMode/SortMode/GroupModes/SortModes for consumers that import from here
export type { GroupMode, SortMode } from './LayoutTypes'
export { GroupModes, SortModes } from './LayoutTypes'

export interface AllBatchesCompleteEvent extends BaseInteractionEvent {
    // Pure terminal signal: all batches are complete.
}

/**
 * GameDataReady
 *
 * Emitted by BatchCoordinator when all game data batches have been dispatched
 * for processing — i.e. all games are in DataManager and all BatchReadyForPlacement
 * events have fired. This is earlier than AllBatchesComplete, which waits for
 * GamesPlaced confirmation.
 *
 * GameSorter listens to this event to trigger section planning. Downstream layout
 * work (shelf placement, artwork prewarm) follows from SectionsReady.
 */
export interface GameDataReadyEvent extends BaseInteractionEvent {
    totalGames: number
    totalBatches: number
}

export interface SomeBatchesCompleteEvent extends BaseInteractionEvent {
    completedBatches: number
    totalBatches: number
}

/**
 * SectionsReadyEvent
 *
 * Emitted by GameSorter after grouping (GroupResolver) + sorting (SectionSorter).
 * Each section carries its own game list and name (used for sign labels).
 * Consumers no longer need to re-derive group boundaries from a flat list.
 */
export interface SectionsReadyEvent extends BaseInteractionEvent {
    sections: ReadonlyArray<Section>
    groupMode: GroupMode
    sortMode: SortMode
}

/**
 * ArrangementRequestedEvent
 *
 * Emitted by LayoutControlPanel when the user changes group or sort mode.
 * Both axes are always carried together so GameSorter sees the full arrangement.
 */
export interface ArrangementRequestedEvent extends BaseInteractionEvent {
    groupMode: GroupMode
    sortMode: SortMode
}

export interface LayoutRequestedEvent extends BaseInteractionEvent {
    layoutMode: LayoutMode
}

/**
 * LayoutChangedEvent
 *
 * Fired when the shelf layout changes at runtime
 * (e.g. layout mode switch, scene reload). Consumers that care about relayout
 * (lighting, instanced renderers, sign placement) listen to this alongside
 * ShelfLayoutDetermined.
 *
 * Phase: reserved seam — no emitters exist yet. Wire behavior in the next branch.
 */
export interface LayoutChangedEvent extends BaseInteractionEvent {
    shelfBounds: ShelfBounds
    shelfLayout: { rows: number; shelvesPerRow?: number }
    /** Why the layout changed (for diagnostics / animation decisions). */
    reason: 'reload' | 'mode-switch' | 'resize'
}
