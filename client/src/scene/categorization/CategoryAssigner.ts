import type { SteamGameData } from '../game-box/types/GameData'

export interface ShelfGroup {
    genre: string        // e.g. "Action", "RPG", "Other"
    label: string        // display label — same as genre for now
    games: SteamGameData[]
}

export class CategoryAssigner {
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
        const otherGroupName = "Other"

        for (const game of games) {
            const genre = (game.genres && game.genres.length > 0) 
                ? game.genres[0].description 
                : otherGroupName
            
            if (!groupsMap.has(genre)) {
                groupsMap.set(genre, [])
            }
            groupsMap.get(genre)!.push(game)
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
