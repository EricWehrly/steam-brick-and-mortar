/**
 * EnvironmentEvents
 *
 * System-to-system pipeline events: batch loading, layout, sort completion.
 * These are not user interaction events — they signal state transitions in the
 * data and rendering pipeline.
 */

import type { BaseInteractionEvent } from '../core/EventManager'
import type { SteamGameData } from '../scene/game-box/types/GameData'
import type { ShelfBounds } from './InteractionEvents'

export interface AllBatchesCompleteEvent extends BaseInteractionEvent {
    // Pure terminal signal: all batches are complete.
}

export interface SomeBatchesCompleteEvent extends BaseInteractionEvent {
    completedBatches: number
    totalBatches: number
}

export interface GamesSortEvent extends BaseInteractionEvent {
    /** Full sorted game list after all batches have loaded. */
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    /**
     * Maps bucket key (RecentlyPlayedBucket value) to human-readable label.
     * Empty map when no games have rtime_last_played > 0.
     */
    buckets: ReadonlyMap<number | string, string>
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
