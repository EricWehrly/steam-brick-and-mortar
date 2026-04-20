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
import type { Section } from './LayoutTypes'

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

export const GameSortModes = {
    RecentlyPlayed: 'recently-played',
    ByGenre:        'by-genre',
    ByPlaytime:     'by-playtime',
    ByRating:       'by-rating',
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

/**
 * SectionsReadyEvent
 *
 * Replaces GamesSortEvent. Emitted by GameSorter after grouping + sorting.
 * Each section carries its own game list and name (used for sign labels).
 * Consumers no longer need to re-derive group boundaries from a flat list.
 */
export interface SectionsReadyEvent extends BaseInteractionEvent {
    sections: ReadonlyArray<Section>
    /** Overall sort/group mode that produced these sections. */
    sortMode: GameSortMode
}

export interface SortRequestedEvent extends BaseInteractionEvent {
    sortMode: GameSortMode
}

import type { LayoutMode } from './LayoutTypes'

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
