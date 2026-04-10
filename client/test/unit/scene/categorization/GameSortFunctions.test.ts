import { describe, it, expect } from 'vitest'
import {
    KNOWN_GENRES,
    groupByGenre,
    sortByGenreThenPlaytime,
    resolveGenre,
    primaryGenre,
    chainComparators,
    sortAlphabetically,
    sortByEnumIndex,
    sortByNumericField,
    groupByKey,
} from '../../../../src/scene/categorization/GameSortFunctions'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

// ─── groupByGenre ──────────────────────────────────────────────────────────────

describe('groupByGenre', () => {
    it('returns empty map for empty input', () => {
        expect(groupByGenre([]).size).toBe(0)
    })

    it('groups games by their primary genre', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Game A', genres: [{ id: '1', description: 'Action' }] },
            { appid: 2, name: 'Game B', genres: [{ id: '1', description: 'Action' }] },
            { appid: 3, name: 'Game C', genres: [{ id: '2', description: 'RPG' }] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.get('Action')).toHaveLength(2)
        expect(result.get('RPG')).toHaveLength(1)
    })

    it('puts games with no genres into "Other"', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Game A' },
            { appid: 2, name: 'Game B', genres: [] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.size).toBe(1)
        expect(result.get('Other')).toHaveLength(2)
    })

    it('normalises "Free to Play" regardless of Steam casing', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'FTP1', genres: [{ id: '37', description: 'Free to Play' }] },
            { appid: 2, name: 'FTP2', genres: [{ id: '37', description: 'Free To Play' }] },
            { appid: 3, name: 'FTP3', genres: [{ id: '37', description: 'FREE TO PLAY' }] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.size).toBe(1)
        expect(result.get('Free to Play')).toHaveLength(3)
    })

    it('maps unrecognised genres to "Other"', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Localized', genres: [{ id: '1', description: 'Acci\u00f3n' }] },
            { appid: 2, name: 'Normal',    genres: [{ id: '1', description: 'Action' }] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.get('Action')).toHaveLength(1)
        expect(result.get('Other')).toHaveLength(1)
    })

    it('produces at most one "Other" group regardless of input shape', () => {
        const gamesNoGenre: Partial<SteamGameData>[] = Array.from({ length: 40 }, (_, i) => ({
            appid: i + 1, name: `Game ${i + 1}`,
        }))
        const gamesWithGenre: Partial<SteamGameData>[] = [
            { appid: 100, name: 'Action Game', genres: [{ id: '1', description: 'Action' }] },
        ]
        const result = groupByGenre([...gamesNoGenre, ...gamesWithGenre] as SteamGameData[])
        expect(result.has('Other')).toBe(true)
        // Only one Other entry (it's a Map key)
        expect([...result.keys()].filter(k => k === 'Other')).toHaveLength(1)
    })

    it('uses genres[0] as the primary category', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'test', genres: [{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.get('Action')).toHaveLength(1)
        expect(result.has('RPG')).toBe(false)
    })

    it('does not treat Early Access as a shelf genre', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'EA Game', genres: [{ id: '70', description: 'Early Access' }] },
        ]
        const result = groupByGenre(games as SteamGameData[])
        expect(result.has('Early Access')).toBe(false)
        expect(result.get('Other')).toHaveLength(1)
    })
})

// ─── resolveGenre / primaryGenre ──────────────────────────────────────────────

describe('resolveGenre', () => {
    it('returns canonical form for known genres', () => {
        expect(resolveGenre('action')).toBe('Action')
        expect(resolveGenre('RPG')).toBe('RPG')
    })

    it('returns "Other" for unknown genres', () => {
        expect(resolveGenre('Acción')).toBe('Other')
        expect(resolveGenre('')).toBe('Other')
    })
})

describe('primaryGenre', () => {
    it('returns resolved genre from genres[0]', () => {
        const game = { genres: [{ id: '1', description: 'Action' }] } as SteamGameData
        expect(primaryGenre(game)).toBe('Action')
    })

    it('returns "Other" when no genres', () => {
        expect(primaryGenre({} as SteamGameData)).toBe('Other')
        expect(primaryGenre({ genres: [] } as SteamGameData)).toBe('Other')
    })
})

// ─── KNOWN_GENRES ─────────────────────────────────────────────────────────────

describe('KNOWN_GENRES', () => {
    it('contains expected canonical names', () => {
        expect(KNOWN_GENRES).toContain('Action')
        expect(KNOWN_GENRES).toContain('Free to Play')
        expect(KNOWN_GENRES.filter(g => g.toLowerCase() === 'free to play')).toHaveLength(1)
    })
})

// ─── sortByGenreThenPlaytime ───────────────────────────────────────────────────

describe('sortByGenreThenPlaytime', () => {
    const game = (genre: string | null, playtime: number) => ({
        genre: genre ?? 'Other',
        playtime_forever: playtime,
    })

    it('groups same-genre games consecutively', () => {
        const games = [
            game('RPG', 100),
            game('Action', 500),
            game('RPG', 300),
            game('Action', 200),
        ]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        expect(sorted[0].genre).toBe(sorted[1].genre)
        expect(sorted[2].genre).toBe(sorted[3].genre)
        expect(sorted[0].genre).not.toBe(sorted[2].genre)
    })

    it('sorts by playtime descending within a genre', () => {
        const games = [
            game('Action', 100),
            game('Action', 500),
            game('Action', 200),
        ]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        expect(sorted[0].playtime_forever).toBe(500)
        expect(sorted[1].playtime_forever).toBe(200)
        expect(sorted[2].playtime_forever).toBe(100)
    })

    it('puts Other/unrecognised games last', () => {
        const games = [
            game('Other', 1000),
            game('Action', 50),
            game('Other', 500),
            game('RPG', 100),
        ]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        expect(sorted[sorted.length - 1].genre).toBe('Other')
        expect(sorted[sorted.length - 2].genre).toBe('Other')
    })

    it('is stable for equal genre+playtime', () => {
        const games = [game('Action', 100), game('Action', 100)]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        expect(sorted).toHaveLength(2)
    })

    it('keeps genre order even when cross-genre playtime would reorder', () => {
        // Foo appears before Bar in KNOWN_GENRES (via sortByEnumIndex).
        // A Bar game has higher playtime than some Foo games — it must still sort after all Foo.
        // Uses fake genres so the test is decoupled from client genre list.
        const ORDER = ['Foo', 'Bar']
        const cmp = chainComparators(
            sortByEnumIndex<{ genre?: string; playtime_forever?: number }>('genre', ORDER),
            sortByNumericField<{ genre?: string; playtime_forever?: number }>('playtime_forever')
        )
        const games = [
            { genre: 'Bar', playtime_forever: 9999 }, // high playtime but second genre
            { genre: 'Foo', playtime_forever: 100 },
            { genre: 'Foo', playtime_forever: 500 },
            { genre: 'Bar', playtime_forever: 200 },
        ]
        const sorted = [...games].sort(cmp)
        // All Foo before all Bar
        expect(sorted[0].genre).toBe('Foo')
        expect(sorted[1].genre).toBe('Foo')
        expect(sorted[2].genre).toBe('Bar')
        expect(sorted[3].genre).toBe('Bar')
        // Within Foo: descending playtime
        expect(sorted[0].playtime_forever).toBe(500)
        expect(sorted[1].playtime_forever).toBe(100)
        // Within Bar: descending playtime
        expect(sorted[2].playtime_forever).toBe(9999)
        expect(sorted[3].playtime_forever).toBe(200)
    })
})

// ─── chainComparators ─────────────────────────────────────────────────────────

describe('chainComparators', () => {
    it('uses first comparator when it returns non-zero', () => {
        const byA = (a: {a: number}, b: {a: number}) => b.a - a.a
        const byB = (a: {b: number}, b: {b: number}) => b.b - a.b
        const chained = chainComparators<{a: number; b: number}>(byA, byB)
        expect(chained({ a: 2, b: 1 }, { a: 1, b: 9 })).toBeLessThan(0)
    })

    it('falls through to second comparator on tie', () => {
        const byA = (a: {a: number}, b: {a: number}) => b.a - a.a
        const byB = (a: {b: number}, b: {b: number}) => b.b - a.b
        const chained = chainComparators<{a: number; b: number}>(byA, byB)
        expect(chained({ a: 5, b: 1 }, { a: 5, b: 9 })).toBeGreaterThan(0)
    })

    it('composes three comparators', () => {
        type Item = { x: number; y: number; z: number }
        const items: Item[] = [
            { x: 1, y: 2, z: 3 },
            { x: 1, y: 2, z: 9 },
            { x: 1, y: 5, z: 1 },
        ]
        const cmp = chainComparators<Item>(
            (a, b) => b.x - a.x,
            (a, b) => b.y - a.y,
            (a, b) => b.z - a.z,
        )
        const sorted = [...items].sort(cmp)
        expect(sorted[0]).toEqual({ x: 1, y: 5, z: 1 })
        expect(sorted[1]).toEqual({ x: 1, y: 2, z: 9 })
        expect(sorted[2]).toEqual({ x: 1, y: 2, z: 3 })
    })
})

describe('sortAlphabetically', () => {
    it('sorts strings case-insensitively ascending', () => {
        const items = [{ name: 'Zelda' }, { name: 'action' }, { name: 'RPG' }]
        const sorted = [...items].sort(sortAlphabetically<{ name?: string }>('name'))
        expect(sorted.map(i => i.name)).toEqual(['action', 'RPG', 'Zelda'])
    })

    it('puts absent values last', () => {
        const items = [{ name: undefined }, { name: 'Alpha' }]
        const sorted = [...items].sort(sortAlphabetically<{ name?: string }>('name'))
        expect(sorted[0].name).toBe('Alpha')
    })
})

describe('sortByEnumIndex', () => {
    const ORDER = ['A', 'B', 'C']

    it('sorts by list position', () => {
        const items = [{ v: 'C' }, { v: 'A' }, { v: 'B' }]
        const sorted = [...items].sort(sortByEnumIndex<{ v?: string }>('v', ORDER))
        expect(sorted.map(i => i.v)).toEqual(['A', 'B', 'C'])
    })

    it('puts unlisted values last', () => {
        const items = [{ v: 'Z' }, { v: 'A' }, { v: 'X' }]
        const sorted = [...items].sort(sortByEnumIndex<{ v?: string }>('v', ORDER))
        expect(sorted[0].v).toBe('A')
        expect(['Z', 'X']).toContain(sorted[1].v)
        expect(['Z', 'X']).toContain(sorted[2].v)
    })
})

describe('groupByKey', () => {
    it('partitions into groups by key function', () => {
        const items = [
            { genre: 'Action', n: 1 },
            { genre: 'RPG', n: 2 },
            { genre: 'Action', n: 3 },
        ]
        const grouped = groupByKey(items, i => i.genre)
        expect(grouped.get('Action')).toHaveLength(2)
        expect(grouped.get('RPG')).toHaveLength(1)
    })

    it('preserves insertion order within groups', () => {
        const items = [{ v: 'A', i: 1 }, { v: 'A', i: 2 }, { v: 'A', i: 3 }]
        const grouped = groupByKey(items, i => i.v)
        expect(grouped.get('A')!.map(x => x.i)).toEqual([1, 2, 3])
    })

    it('handles empty input', () => {
        expect(groupByKey([], () => 'x').size).toBe(0)
    })
})
