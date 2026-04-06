import type { SteamGameData } from '../game-box/types/GameData'
import { Logger } from '../../utils/Logger'

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
export const KNOWN_GENRES: ReadonlyArray<string> = [
    'Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing',
    'Casual', 'Indie', 'Massively Multiplayer', 'Free to Play', 'Early Access',
    'Puzzle', 'Platformer', 'Shooter', 'Horror', 'Stealth', 'Fighting', 'Survival', 'Anime',
]

const GENRE_LOOKUP: ReadonlyMap<string, string> = new Map(KNOWN_GENRES.map(g => [g.toLowerCase(), g]))

/**
 * Sort comparator for genre-first, playtime-second ordering.
 * Games with recognised genres are grouped together; within each genre,
 * sorted by playtime descending. Games with no recognised genre sort last.
 *
 * Safe to use as the sortFn option in SteamApiClient.loadGamesProgressively.
 */
export function genrePlaytimeSortFn(
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

export class CategoryAssigner {
    private static readonly logger = Logger.createLogFunctions(CategoryAssigner.name)

    assign(games: SteamGameData[]): ShelfGroup[] {
        if (!games || games.length === 0) return []

        const groupsMap = new Map<string, SteamGameData[]>()
        const otherGroupName = 'Other'
        let noGenreCount = 0

        for (const game of games) {
            let genre: string
            if (game.genres && game.genres.length > 0) {
                const raw = game.genres[0].description
                const canonical = GENRE_LOOKUP.get(raw.toLowerCase())
                if (canonical !== undefined) {
                    genre = canonical
                } else {
                    CategoryAssigner.logger.warn(`[CAT-DEBUG] Unrecognized genre "${raw}" for "${game.name}" (appid ${game.appid}) ? Other`)
                    genre = otherGroupName
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
            CategoryAssigner.logger.warn(`[CAT-DEBUG] ${noGenreCount}/${games.length} games had no recognised genre � landed in "Other".`)
        }

        const shelfGroups: ShelfGroup[] = Array.from(groupsMap.entries()).map(([genre, groupGames]) => ({
            genre, label: genre, games: groupGames
        }))

        shelfGroups.sort((a, b) => {
            if (a.genre === otherGroupName) return 1
            if (b.genre === otherGroupName) return -1
            return b.games.length - a.games.length
        })

        return shelfGroups
    }
}
