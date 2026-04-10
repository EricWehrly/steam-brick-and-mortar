/**
 * GameSortFunctions
 *
 * Generic, composable sort and grouping primitives for game lists.
 * All functions are pure — no events, no state, no imports from scene or Steam layers.
 *
 * ── Comparator factories ───────────────────────────────────────────────────────
 *
 *   sortByNumericField<T>(key, secondary?)
 *     Sort descending by a numeric property. 0/absent values sort last.
 *     Ties resolved by optional secondary key (also descending).
 *
 *   sortAlphabetically<T>(key)
 *     Sort ascending by a string property. Case-insensitive.
 *
 *   sortByEnumIndex<T>(key, orderedValues)
 *     Sort by position in an explicit ordered list.
 *     Items not in the list sort last (stable relative to each other).
 *
 * ── Chaining ──────────────────────────────────────────────────────────────────
 *
 *   chainComparators(...comparators)
 *     Compose multiple comparators left-to-right. Each comparator acts as a
 *     tiebreaker for the previous. Equivalent to SQL's ORDER BY a, b, c.
 *
 *     Example:
 *       games.sort(chainComparators(
 *         sortByEnumIndex('genre', KNOWN_GENRES),
 *         sortByNumericField('playtime_forever'),
 *         sortAlphabetically('name'),
 *       ))
 *
 * ── Grouping ──────────────────────────────────────────────────────────────────
 *
 *   groupByKey<T, K>(items, keyFn)
 *     Partition an array into a Map keyed by the result of keyFn.
 *     Insertion order within each group is preserved.
 */

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
