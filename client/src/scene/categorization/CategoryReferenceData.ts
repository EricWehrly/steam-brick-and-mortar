/**
 * Static reference data for the category-reference tool (CategoryReferencePanel) - dev/design
 * quick-reference for game categories/sort dimensions:
 *   - Steam API genres (what the store actually serves)
 *   - Planned meta-categories (library-state based)
 *   - Planned sort/filter dimensions (recency, play-next, etc.)
 *
 * Split out of the old DOM CategoryReferencePanel.ts when that class was retired in favor of the
 * one uikit implementation (direct request, 2026-09-05: "we don't need a 'VR' variant. We're just
 * gonna have the one") - this data has no UI-building logic of its own, so it doesn't need to live
 * inside either renderer.
 */

import { KNOWN_GENRES } from './GameSortFunctions'

export interface CategoryEntry {
    label: string
    description: string
    status: 'live' | 'planned' | 'idea'
}

export const STEAM_GENRE_CATEGORIES: CategoryEntry[] = KNOWN_GENRES.map(g => ({
    label: g,
    description: `Steam genre — matched case-insensitively from genres[0].description`,
    status: 'live',
}))

export const META_CATEGORIES: CategoryEntry[] = [
    {
        label: 'New to Library',
        description: 'Games added in the last 30–90 days (date_added from Steam).',
        status: 'planned',
    },
    {
        label: 'Play Next',
        description: 'Unplayed or short-playtime games surfaced for discovery (< 2h playtime).',
        status: 'planned',
    },
    {
        label: 'Recently Updated',
        description: 'Games with a recent build/patch (last_played or build_id delta). Better as a sort dimension than a shelf.',
        status: 'idea',
    },
    {
        label: 'Recently Played',
        description: 'Games with recent playtime activity — a time-sorted view, not a shelf category.',
        status: 'idea',
    },
]

export const SORT_DIMENSIONS: CategoryEntry[] = [
    {
        label: 'Alphabetical',
        description: 'A–Z by game name.',
        status: 'planned',
    },
    {
        label: 'Most Played',
        description: 'Descending by total playtime_forever.',
        status: 'planned',
    },
    {
        label: 'Recently Played',
        description: 'Descending by rtime_last_played.',
        status: 'planned',
    },
    {
        label: 'Recently Updated',
        description: 'Descending by build date / patch timestamp (requires Store API).',
        status: 'idea',
    },
    {
        label: 'Metacritic',
        description: 'Descending by metacritic.score where available.',
        status: 'idea',
    },
]
