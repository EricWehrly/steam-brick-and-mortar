import type { SteamGameData } from '../game-box/types/GameData'
import { Logger } from '../../utils/Logger'

/**
 * Well-known group names for category assignment.
 */
export const CategoryGroupName = {
    Other: 'Other',
} as const
export type CategoryGroupName = typeof CategoryGroupName[keyof typeof CategoryGroupName]

export interface ShelfGroup {
    genre: string
    label: string
    games: SteamGameData[]
}

/**
 * Hardcoded list of recognised genre names, in display-canonical casing.
 * Case-insensitive lookup so "Free to Play" / "Free To Play" both match.
 * Unrecognised genres fall into "Other".
 */
// Note: 'Early Access' is intentionally excluded — it is a release state, not a content genre.
export const KNOWN_GENRES: ReadonlyArray<string> = [
    'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
    'Casual', 'Indie', 'Massively Multiplayer', 'Free to Play',
    'Puzzle', 'Platformer', 'Shooter', 'Horror', 'Stealth', 'Fighting', 'Survival', 'Anime',
]

const GENRE_LOOKUP: ReadonlyMap<string, string> = new Map(KNOWN_GENRES.map(g => [g.toLowerCase(), g]))

/**
 * Sort comparator: canonical genre index first, playtime descending within each genre.
 * Unrecognised genres sort last.
 *
 * TD: generic-sort — replace with a generic sortByFields(['genre', 'playtime']) utility
 * once the sort-policy abstraction is designed.
 */
export function sortByGenreThenPlaytime(
    a: { genres?: Array<{ description: string }>, playtime_forever?: number },
    b: { genres?: Array<{ description: string }>, playtime_forever?: number }
): number {
    const genreA = a.genres?.[0]?.description ? (GENRE_LOOKUP.get(a.genres[0].description.toLowerCase()) ?? 'Other') : 'Other'
    const genreB = b.genres?.[0]?.description ? (GENRE_LOOKUP.get(b.genres[0].description.toLowerCase()) ?? 'Other') : 'Other'

    if (genreA === 'Other' && genreB !== 'Other') return 1
    if (genreB === 'Other' && genreA !== 'Other') return -1

    if (genreA === genreB) {
        return (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)
    }

    return KNOWN_GENRES.indexOf(genreA) - KNOWN_GENRES.indexOf(genreB)
}

/**
 * Data transformer: maps a flat list of SteamGameData into ShelfGroup[] bucketed by genre.
 * Responsibility: grouping only. Sorting policy lives upstream (SteamApiClient sortFn).
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / CategoryAssigner"
 */
export class CategoryAssigner {
    private static readonly logger = Logger.createLogFunctions(CategoryAssigner.name)

    assign(games: SteamGameData[]): ShelfGroup[] {
        if (!games || games.length === 0) return []

        const groupsMap = new Map<string, SteamGameData[]>()
        let noGenreCount = 0

        for (const game of games) {
            let genre: string
            if (game.genres && game.genres.length > 0) {
                const raw = game.genres[0].description
                const canonical = GENRE_LOOKUP.get(raw.toLowerCase())
                genre = canonical ?? CategoryGroupName.Other
                if (!canonical) {
                    CategoryAssigner.logger.warn(`Unrecognized genre "${raw}" for "${game.name}" (appid ${game.appid}) -> Other`)
                    noGenreCount++
                }
            } else {
                genre = CategoryGroupName.Other
                noGenreCount++
            }
            if (!groupsMap.has(genre)) groupsMap.set(genre, [])
            groupsMap.get(genre)!.push(game)
        }

        if (noGenreCount > 0) {
            CategoryAssigner.logger.warn(`${noGenreCount}/${games.length} games had no recognised genre -> "Other"`)
        }

        const shelfGroups: ShelfGroup[] = Array.from(groupsMap.entries()).map(([genre, groupGames]) => ({
            genre,
            label: genre,
            games: groupGames,
        }))

        // Sort groups: largest first, Other last
        shelfGroups.sort((a, b) => {
            if (a.genre === CategoryGroupName.Other) return 1
            if (b.genre === CategoryGroupName.Other) return -1
            return b.games.length - a.games.length
        })

        return shelfGroups
    }
}
