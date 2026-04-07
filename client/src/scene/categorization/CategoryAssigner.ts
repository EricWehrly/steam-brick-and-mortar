import type { SteamGameData } from '../game-box/types/GameData'
import { Logger } from '../../utils/Logger'


/**
 * Well-known group names for category assignment.
 * Using an enum prevents magic string scatter and makes exhaustive checks possible.
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

export type RecentlyPlayedBucket = 'today' | 'this-week' | 'this-month' | 'this-year' | 'before' | 'unplayed'

export function getRecentlyPlayedBucket(game: SteamGameData, nowSeconds?: number): RecentlyPlayedBucket {
    const now = nowSeconds ?? Math.floor(Date.now() / 1000)
    const lastPlayed = game.rtime_last_played ?? 0

    if (lastPlayed === 0) return 'unplayed'

    const diff = now - lastPlayed
    if (diff < 0) return 'today' // Future? Treat as today.

    const DAY = 24 * 60 * 60
    if (diff < DAY) return 'today'
    if (diff < 7 * DAY) return 'this-week'
    if (diff < 30 * DAY) return 'this-month'
    if (diff < 365 * DAY) return 'this-year'
    return 'before'
}

export function getBucketLabel(bucket: RecentlyPlayedBucket): string {
    switch (bucket) {
        case 'today': return 'Played Today'
        case 'this-week': return 'Played This Week'
        case 'this-month': return 'Played This Month'
        case 'this-year': return 'Played This Year'
        case 'before': return 'Played Before'
        case 'unplayed': return 'Never Played'
    }
}

/**
 * Hardcoded list of recognised genre names, in display-canonical casing.
 * Case-insensitive lookup so "Free to Play" / "Free To Play" both match.
 * Unrecognised genres fall into "Other".
 */
// Note: 'Early Access' is intentionally excluded — it is a release state, not a content genre.
// Games tagged only as Early Access land in Other.
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
 * Use as the sortFn option in SteamApiClient.loadGamesProgressively.
 * TD: generic-sort — replace with a generic sortByFields(['genre', 'playtime']) utility
 * once the sort-policy abstraction is designed.
 */
// TD: generic-sort — this should be a generic sortByFields utility once sort policy is formalized
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

    const idxA = KNOWN_GENRES.indexOf(genreA)
    const idxB = KNOWN_GENRES.indexOf(genreB)
    return idxA - idxB
}

/**
 * Data transformer: maps a flat list of SteamGameData into ShelfGroup[] bucketed by genre.
 * Responsibility: grouping only. Sorting policy lives upstream (SteamApiClient sortFn)
 * and group ordering is a separate concern from the transform itself.
 * Tech debt link: docs/roadmaps/tech-debt.md → "Category System Tech Debt / CategoryAssigner is a temporary classification hack"
 */

/**
 * Sort comparator: most-recently-played first.
 * Games with rtime_last_played = 0 (never played) sort last.
 * Ties fall back to playtime descending.
 */
export function sortByRecentlyPlayed(
    a: { rtime_last_played?: number, playtime_forever?: number },
    b: { rtime_last_played?: number, playtime_forever?: number }
): number {
    const rtimeA = a.rtime_last_played ?? 0
    const rtimeB = b.rtime_last_played ?? 0
    if (rtimeA !== rtimeB) return rtimeB - rtimeA
    return (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)
}

export class CategoryAssigner {
    private static readonly logger = Logger.createLogFunctions(CategoryAssigner.name)

    assign(games: SteamGameData[]): ShelfGroup[] {
        if (!games || games.length === 0) return []

        const groupsMap = new Map<string, SteamGameData[]>()
        const otherGroupName: string = CategoryGroupName.Other
        let noGenreCount = 0

        for (const game of games) {
            let genre: string
            if (game.genres && game.genres.length > 0) {
                const raw = game.genres[0].description
                const canonical = GENRE_LOOKUP.get(raw.toLowerCase())
                genre = canonical ?? otherGroupName
                if (!canonical) {
                    CategoryAssigner.logger.warn(`[CAT-DEBUG] Unrecognized genre "${raw}" for "${game.name}" (appid ${game.appid}) -> Other`)
                    noGenreCount++
                }
            } else {
                genre = otherGroupName
                noGenreCount++
            }
            if (!groupsMap.has(genre)) groupsMap.set(genre, [])
            groupsMap.get(genre)!.push(game)
        }

        if (noGenreCount > 0) {
            CategoryAssigner.logger.warn(`[CAT-DEBUG] ${noGenreCount}/${games.length} games had no recognised genre -> landed in "Other".`)
        }

        const shelfGroups: ShelfGroup[] = Array.from(groupsMap.entries()).map(([genre, groupGames]) => ({
            genre, label: genre, games: groupGames
        }))

        // Sort groups by size desc, Other last. This sorts groups, not individual games;
        // it is not redundant with sortByGenreThenPlaytime which sorts games within the pipeline.
        // Sort groups by size desc, Other last. Not redundant with sortByGenreThenPlaytime
        // (which sorts individual games upstream; this sorts the resulting groups).
        shelfGroups.sort((a, b) => {
            if (a.genre === otherGroupName) return 1
            if (b.genre === otherGroupName) return -1
            return b.games.length - a.games.length
        })

        return shelfGroups
    }
}
