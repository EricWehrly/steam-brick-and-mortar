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

export const GameSortModes = {
    RecentlyPlayed: 'recently-played',
    ByGenre:        'by-genre',
    ByPlaytime:     'by-playtime',
} as const

export type GameSortMode = typeof GameSortModes[keyof typeof GameSortModes]

export interface GamesSortEvent extends BaseInteractionEvent {
    /** Full sorted game list after all batches have loaded. */
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    /**
     * Maps bucket key to human-readable label.
     * For recency sort: time-window keys (RecentlyPlayedBucket values).
     * For genre sort: genre name keys.
     * Empty for playtime sort (no meaningful sections).
     */
    buckets: ReadonlyMap<number | string, string>
    /** Which sort policy produced this event. */
    sortMode: GameSortMode
}

export interface SortRequestedEvent extends BaseInteractionEvent {
    sortMode: GameSortMode
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
