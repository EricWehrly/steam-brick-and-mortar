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
            CategoryAssigner.logger.warn(`[CAT-DEBUG] ${noGenreCount}/${games.length} games had no recognised genre — landed in "Other".`)
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
