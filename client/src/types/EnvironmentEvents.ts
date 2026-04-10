/**
 * EnvironmentEvents
 *
 * System-to-system pipeline events for the game loading and sorting environment.
 * These are not user interaction events — they signal state transitions in the
 * data pipeline (batch loading, sort completion).
 *
 * Follows the same pattern as LightingEvents.ts. InteractionEvents.ts re-exports
 * everything here for backward compatibility during migration.
 */

import type { BaseInteractionEvent } from '../core/EventManager'
import type { SteamGameData } from '../scene/game-box/types/GameData'

export interface AllBatchesCompleteEvent extends BaseInteractionEvent {
    // Pure terminal signal: all batches are complete.
}

export interface GamesSortEvent extends BaseInteractionEvent {
    /** Full sorted game list after all batches have loaded. */
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>
    /** Maps bucket key (RecentlyPlayedBucket value or genre string) to human-readable label. */
    buckets: ReadonlyMap<number | string, string>
    /** True if any game has rtime_last_played > 0 (i.e. recently-played data is available). */
    hasRecentlyPlayedData: boolean
}
