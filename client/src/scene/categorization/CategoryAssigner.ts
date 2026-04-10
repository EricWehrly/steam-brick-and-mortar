/**
 * CategoryAssigner
 *
 * Genre-domain config and grouping for Steam games.
 *
 * OWNS:
 *   KNOWN_GENRES       — canonical display list, controls sort/lookup order
 *   ShelfGroup         — grouped game list type used by ShelfSectionPlanner
 *   CategoryAssigner   — groups a flat game list by primary genre
 *
 * Sort primitives (sortByEnumIndex, chainComparators, etc.) live in
 * GameSortFunctions. Recency sort + bucket logic lives in GameSorter.
 */

import type { SteamGameData } from '../game-box/types/GameData'
import { Logger } from '../../utils/Logger'
import { chainComparators, sortByEnumIndex, sortByNumericField, groupByKey } from './GameSortFunctions'

// ─── Genre config ──────────────────────────────────────────────────────────────

export const CategoryGroupName = {
    Other: 'Other',
} as const
export type CategoryGroupName = typeof CategoryGroupName[keyof typeof CategoryGroupName]

/**
 * Canonical genre list. Order controls shelf section display order.
 * Note: 'Early Access' intentionally absent — it's a release state, not a genre.
 */
export const KNOWN_GENRES: ReadonlyArray<string> = [
    'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
    'Casual', 'Indie', 'Massively Multiplayer', 'Free to Play',
    'Puzzle', 'Platformer', 'Shooter', 'Horror', 'Stealth', 'Fighting', 'Survival', 'Anime',
]

const GENRE_LOOKUP: ReadonlyMap<string, string> = new Map(KNOWN_GENRES.map(g => [g.toLowerCase(), g]))

export interface ShelfGroup {
    genre: string
    label: string
    games: SteamGameData[]
}

// ─── Genre sort ────────────────────────────────────────────────────────────────

/**
 * Canonical genre index first, playtime descending within genre.
 * Unrecognised genres sort last (not in KNOWN_GENRES → index Infinity).
 *
 * Built with chainComparators — extend by appending more comparators:
 *   chainComparators(sortByEnumIndex('genre', KNOWN_GENRES), sortAlphabetically('name'))
 */
type GenrePlaytimeItem = { genre?: string; playtime_forever?: number }

export const sortByGenreThenPlaytime = chainComparators<GenrePlaytimeItem>(
    sortByEnumIndex<GenrePlaytimeItem>('genre', KNOWN_GENRES),
    sortByNumericField<GenrePlaytimeItem>('playtime_forever')
)

// ─── Canonical genre resolver ──────────────────────────────────────────────────

/** Map a raw genre description to its canonical form, or 'Other' if unrecognised. */
export function resolveGenre(rawDescription: string): string {
    return GENRE_LOOKUP.get(rawDescription.toLowerCase()) ?? CategoryGroupName.Other
}

/** Extract and canonicalize the primary genre from a SteamGameData entry. */
export function primaryGenre(game: SteamGameData): string {
    const raw = game.genres?.[0]?.description
    return raw ? resolveGenre(raw) : CategoryGroupName.Other
}

// ─── CategoryAssigner ─────────────────────────────────────────────────────────

/**
 * Groups a flat list of SteamGameData into ShelfGroup[] by primary genre.
 * Sorting policy lives upstream (SteamApiClient sortFn) or in GameSortFunctions.
 *
 * Tech debt: docs/roadmaps/tech-debt.md → "Category System Tech Debt / CategoryAssigner"
 */
export class CategoryAssigner {
    private static readonly logger = Logger.createLogFunctions(CategoryAssigner.name)

    assign(games: SteamGameData[]): ShelfGroup[] {
        if (!games || games.length === 0) return []

        const grouped = groupByKey(games, primaryGenre)

        // Log unrecognised genres (any group not in KNOWN_GENRES and not 'Other')
        let unrecognised = 0
        for (const [genre, group] of grouped) {
            if (genre !== CategoryGroupName.Other && !KNOWN_GENRES.includes(genre)) {
                CategoryAssigner.logger.warn(`Unrecognised genre "${genre}" (${group.length} games) → Other`)
                unrecognised++
            }
        }
        if (unrecognised === 0) {
            const otherCount = grouped.get(CategoryGroupName.Other)?.length ?? 0
            if (otherCount > 0) {
                CategoryAssigner.logger.warn(`${otherCount}/${games.length} games had no recognised genre → "Other"`)
            }
        }

        const shelfGroups: ShelfGroup[] = Array.from(grouped.entries()).map(([genre, groupGames]) => ({
            genre,
            label: genre,
            games: groupGames,
        }))

        // Sort groups: KNOWN_GENRES order first, Other last, then by size desc within unknowns
        shelfGroups.sort((a, b) => {
            const ai = KNOWN_GENRES.indexOf(a.genre)
            const bi = KNOWN_GENRES.indexOf(b.genre)
            if (a.genre === CategoryGroupName.Other) return 1
            if (b.genre === CategoryGroupName.Other) return -1
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return b.games.length - a.games.length
        })

        return shelfGroups
    }
}
