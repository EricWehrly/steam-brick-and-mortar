/**
 * LayoutTypes
 *
 * Domain types for the layout pipeline: Layout → Sections → Sort → Placement.
 * These are data shapes, not events. Import from here when you need Section
 * or related types without pulling in event definitions.
 */

import type { SteamGameData } from '../scene/game-box/types/GameData'
import type { GameSortMode } from './EnvironmentEvents'

/**
 * A named partition of games produced by grouping + sorting.
 *
 * Ungrouped layouts produce one section (name: '') containing all games.
 * Grouped layouts produce N sections, one per group (genre, tag, rating tier, etc.).
 *
 * Games in a section are already sorted. Spatial allocation is assigned later by
 * the layout system and is absent until SectionsReady fires.
 */
export interface Section {
    /** Human-readable label — used for sign placement. Empty string for ungrouped. */
    name: string
    /** Sorted games belonging to this section. */
    games: ReadonlyArray<Readonly<SteamGameData>>
    /** Which sort mode was applied within this section. */
    sortMode: GameSortMode
}
