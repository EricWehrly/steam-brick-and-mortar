/**
 * GameSortFunctions
 *
 * Genre-domain config plus generic, composable sort and grouping primitives for game lists.
 * All functions are pure — no events, no state.
 *
 * ── Genre config ──────────────────────────────────────────────────────────────
 *
 *   KNOWN_GENRES         Canonical genre list (controls shelf sort/display order)
 *   ShelfGroup           Grouped game list type used by ShelfSectionPlanner
 *   resolveGenre(raw)    Map a raw Steam genre string to canonical, or 'Other'
 *   primaryGenre(game)   Extract and canonicalize genres[0].description
 *   groupByGenre(games)  Partition games by primaryGenre
 *   sortByGenreThenPlaytime  Ready-made chainComparators result
 *
 * ── Comparator factories ──────────────────────────────────────────────────────
 *
 *   sortByNumericField<T>(key, secondary?)
 *   sortAlphabetically<T>(key)
 *   sortByEnumIndex<T>(key, orderedValues)
 *
 * ── Chaining ──────────────────────────────────────────────────────────────────
 *
 *   chainComparators(...comparators)
 *
 * ── Grouping ──────────────────────────────────────────────────────────────────
 *
 *   groupByKey<T, K>(items, keyFn)
 */

import type { SteamGameData } from '../game-box/types/GameData'

// ─── Genre config ──────────────────────────────────────────────────────────────

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

/** Map a raw genre description to its canonical form, or 'Other' if unrecognised. */
export function resolveGenre(rawDescription: string): string {
    return GENRE_LOOKUP.get(rawDescription.toLowerCase()) ?? 'Other'
}

/** Extract and canonicalize the primary genre from a SteamGameData entry. */
export function primaryGenre(game: SteamGameData): string {
    const raw = game.genres?.[0]?.description
    return raw ? resolveGenre(raw) : 'Other'
}

/**
 * Group a flat game list by primary genre.
 * Returns a Map<string, SteamGameData[]>.
 */
export function groupByGenre(games: readonly SteamGameData[]): Map<string, SteamGameData[]> {
    return groupByKey(games, primaryGenre)
}

// ─── Comparator factories ──────────────────────────────────────────────────────

type Comparator<T> = (a: Readonly<T>, b: Readonly<T>) => number

/** Keys of T whose value type is assignable to number | undefined. */
type NumericKey<T> = {
    [K in keyof T]: T[K] extends number | undefined ? K : never
}[keyof T]

/** Keys of T whose value type is assignable to string | undefined. */
type StringKey<T> = {
    [K in keyof T]: T[K] extends string | undefined ? K : never
}[keyof T]

/**
 * Sort descending by a numeric field. Items where the field is 0 or absent sort last.
 * Ties fall through to secondaryKey (also descending), then to stable order.
 */
export function sortByNumericField<T>(
    primaryKey: NumericKey<T>,
    secondaryKey?: NumericKey<T>
): Comparator<T> {
    return (a, b) => {
        const av = (a[primaryKey] as number | undefined) ?? 0
        const bv = (b[primaryKey] as number | undefined) ?? 0
        if (av !== bv) return bv - av
        if (secondaryKey !== undefined) {
            const as2 = (a[secondaryKey] as number | undefined) ?? 0
            const bs2 = (b[secondaryKey] as number | undefined) ?? 0
            return bs2 - as2
        }
        return 0
    }
}

/**
 * Sort ascending by a string field. Case-insensitive, locale-aware.
 * Items where the field is absent sort last.
 */
export function sortAlphabetically<T>(key: StringKey<T>): Comparator<T> {
    return (a, b) => {
        const av = (a[key] as string | undefined) ?? ''
        const bv = (b[key] as string | undefined) ?? ''
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, undefined, { sensitivity: 'base' })
    }
}

/**
 * Sort by position in an explicit ordered list (ascending index = first).
 * Items not present in orderedValues sort last, stable relative to each other.
 * The key must be a string property of T.
 */
export function sortByEnumIndex<T>(
    key: StringKey<T>,
    orderedValues: ReadonlyArray<string>
): Comparator<T> {
    const indexMap = new Map(orderedValues.map((v, i) => [v, i]))
    return (a, b) => {
        const av = (a[key] as string | undefined) ?? ''
        const bv = (b[key] as string | undefined) ?? ''
        const ai = indexMap.get(av) ?? Infinity
        const bi = indexMap.get(bv) ?? Infinity
        return ai - bi
    }
}

// ─── Chaining ──────────────────────────────────────────────────────────────────

/**
 * Compose comparators left-to-right. The first comparator that returns non-zero wins.
 * Equivalent to SQL's ORDER BY a, b, c.
 *
 *   games.sort(chainComparators(
 *     sortByEnumIndex('genre', KNOWN_GENRES),
 *     sortByNumericField('playtime_forever'),
 *     sortAlphabetically('name'),
 *   ))
 */
export function chainComparators<T>(...comparators: Array<Comparator<T>>): Comparator<T> {
    return (a, b) => {
        for (const cmp of comparators) {
            const result = cmp(a, b)
            if (result !== 0) return result
        }
        return 0
    }
}

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

// ─── Grouping ──────────────────────────────────────────────────────────────────

/**
 * Partition items into a Map keyed by the result of keyFn.
 * Insertion order within each group and across groups is preserved.
 *
 *   const byGenre = groupByKey(games, g => g.genres?.[0]?.description ?? 'Other')
 */
export function groupByKey<T, K>(
    items: readonly T[],
    keyFn: (item: T) => K
): Map<K, T[]> {
    const result = new Map<K, T[]>()
    for (const item of items) {
        const key = keyFn(item)
        const group = result.get(key)
        if (group) {
            group.push(item)
        } else {
            result.set(key, [item])
        }
    }
    return result
}
