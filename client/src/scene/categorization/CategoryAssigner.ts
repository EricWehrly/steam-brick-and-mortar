import type { SteamGameData } from '../game-box/types/GameData'
import { Logger } from '../../utils/Logger'

export interface ShelfGroup {
    genre: string        // e.g. "Action", "RPG", "Other"
    label: string        // display label — same as genre for now
    games: SteamGameData[]
}

/**
 * TD: remove once categories bug is resolved.
 * Hard-coded set of recognized genre names used for debug validation.
 * Any game whose primary genre is not in this set triggers a warning.
 */
const RECOGNIZED_GENRES: ReadonlySet<string> = new Set([
    'Action',
    'Adventure',
    'RPG',
    'Strategy',
    'Simulation',
    'Sports',
    'Racing',
    'Casual',
    'Indie',
    'Massively Multiplayer',
    'Free to Play',
    'Free To Play',   // Steam uses both casings
    'Early Access',
    'Puzzle',
    'Platformer',
    'Shooter',
    'Horror',
    'Stealth',
    'Fighting',
    'Survival',
    'Anime',
    'Other',
])

export class CategoryAssigner {
    private static readonly logger = Logger.createLogFunctions(CategoryAssigner.name)

    /**
     * Assigns games to groups based on their primary genre.
     * 
     * Rules:
     * - Group by genres[0].description (primary genre only)
     * - Games with no genres go into "Other" group
     * - Sort groups: descending by game count, "Other" always last
     * - Return empty array if input is empty
     */
    assign(games: SteamGameData[]): ShelfGroup[] {
        if (!games || games.length === 0) {
            return []
        }

        const groupsMap = new Map<string, SteamGameData[]>()
        const otherGroupName = 'Other'
        let noGenreCount = 0

        for (const game of games) {
            let genre: string
            if (game.genres && game.genres.length > 0) {
                genre = game.genres[0].description
                // TD: remove — debug only; warns when a genre isn't in our recognized list
                if (!RECOGNIZED_GENRES.has(genre)) {
                    CategoryAssigner.logger.warn(
                        `[CAT-DEBUG] Unrecognized genre "${genre}" for "${game.name}" (appid ${game.appid})`
                    )
                }
            } else {
                genre = otherGroupName
                noGenreCount++
            }

            if (!groupsMap.has(genre)) {
                groupsMap.set(genre, [])
            }
            groupsMap.get(genre)!.push(game)
        }

        // TD: remove — debug summary
        if (noGenreCount > 0) {
            CategoryAssigner.logger.warn(
                `[CAT-DEBUG] ${noGenreCount}/${games.length} games had NO genre data — landed in "Other". ` +
                `Check buildEnhancedGame / normalizeBatchData paths.`
            )
        }

        const shelfGroups: ShelfGroup[] = Array.from(groupsMap.entries()).map(([genre, groupGames]) => ({
            genre,
            label: genre,
            games: groupGames
        }))

        // Sort: descending by game count, "Other" always last
        shelfGroups.sort((a, b) => {
            if (a.genre === otherGroupName) return 1
            if (b.genre === otherGroupName) return -1
            return b.games.length - a.games.length
        })

        return shelfGroups
    }
}
