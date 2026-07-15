/**
 * Computes which GroupMode/SortMode dropdown options are actually meaningful for the current
 * game data, rather than trusting a fixed compile-time list or the dead `steam.hasRecencyData`
 * flag it replaces (see docs/plans/taxonomy-data-event-plan.md). A single dedup/aggregate pass
 * over the current game list - callers re-run this whenever new data might have landed
 * (GameDataReady, TaxonomyDataReady) rather than trusting event payloads.
 *
 * Two baseline options (None, Alphabetical) and one field that's always populated even if often
 * zero (ByPlaytime, since playtime_forever always exists) are unconditionally available. Every
 * other dimension only appears once at least one game in the current list actually carries that
 * data - matching the "not-yet-fetched, but reachable" vs "channel-exclusive" distinction in
 * docs/architecture/sort-filter-data-provenance.md. This is a presence gate, not a coverage
 * gate - unlike AppSettings.taxonomyCoverageThreshold (which only gates *default selection*),
 * an option shows up here the moment even one game has the data, since more will stream in.
 */

import type { SteamGameData } from '../scene/game-box/types/GameData'
import { GroupModes, SortModes } from '../types/LayoutTypes'
import type { GroupMode, SortMode } from '../types/LayoutTypes'
import { getTopSteamSpyTags } from '../steam/utils/SteamSpyTags'

export interface AvailableDimensions {
    readonly groupModes: ReadonlySet<GroupMode>
    readonly sortModes: ReadonlySet<SortMode>
}

function hasAnyTags(game: SteamGameData): boolean {
    if (game.steamspy_top_tags && game.steamspy_top_tags.length > 0) return true
    return getTopSteamSpyTags(game.steamspy_tags).length > 0
}

export function computeAvailableDimensions(games: readonly SteamGameData[]): AvailableDimensions {
    const hasRecency = games.some(game => (game.rtime_last_played ?? 0) > 0)
    const hasGenres = games.some(game => (game.genres?.length ?? 0) > 0)
    const hasTags = games.some(hasAnyTags)
    const hasRating = games.some(game => game.userscore !== undefined)
    const hasUserCollections = games.some(game => (game.user_collections?.length ?? 0) > 0)

    const groupModes = new Set<GroupMode>([GroupModes.None, GroupModes.ByPlaytime])
    if (hasRecency) groupModes.add(GroupModes.ByRecency)
    if (hasGenres) groupModes.add(GroupModes.ByGenre)
    if (hasTags) groupModes.add(GroupModes.ByTag)
    if (hasRating) groupModes.add(GroupModes.ByRating)
    if (hasUserCollections) groupModes.add(GroupModes.ByUserCollection)

    const sortModes = new Set<SortMode>([SortModes.Alphabetical, SortModes.ByPlaytime])
    if (hasRecency) sortModes.add(SortModes.ByLastPlayed)
    if (hasRating) sortModes.add(SortModes.ByRating)

    return { groupModes, sortModes }
}
