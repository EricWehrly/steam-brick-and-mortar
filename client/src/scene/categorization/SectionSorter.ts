/**
 * SectionSorter
 *
 * Stage B of the two-stage arrangement pipeline.
 *
 * Given Section[]s from GroupResolver, sorts games within each section
 * according to the active SortMode. Returns new Section objects with
 * sorted game arrays; sections themselves are not reordered.
 */

import type { Section, SortMode } from '../../types/LayoutTypes'
import { SortModes } from '../../types/LayoutTypes'
import type { SteamGameData } from '../game-box/types/GameData'
import { sortByNumericField, sortAlphabetically } from './GameSortFunctions'

/**
 * Sort games within each section according to `sortMode`.
 * Returns a new Section[] — inputs are not mutated.
 */
export function sortSections(sections: Section[], sortMode: SortMode): Section[] {
    return sections.map(section => ({
        ...section,
        games: sortGames([...section.games] as SteamGameData[], sortMode),
        sortMode,
    }))
}

function sortGames(games: SteamGameData[], sortMode: SortMode): SteamGameData[] {
    switch (sortMode) {
        case SortModes.Alphabetical:
            return games.sort(sortAlphabetically<SteamGameData>('name'))

        case SortModes.ByPlaytime:
            return games.sort(sortByNumericField<SteamGameData>('playtime_forever'))

        case SortModes.ByRating:
            return games.sort(sortByNumericField<SteamGameData>('userscore', 'playtime_forever'))

        case SortModes.ByLastPlayed:
            return games.sort(sortByNumericField<SteamGameData>('rtime_last_played', 'playtime_forever'))
    }
}
