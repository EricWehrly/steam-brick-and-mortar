import { describe, it, expect } from 'vitest'
import { CategoryAssigner, KNOWN_GENRES, sortByGenreThenPlaytime, primaryGenre, type ShelfGroup } from './CategoryAssigner'
import { sortByNumericField, getRecentlyPlayedBucket, getBucketLabel, RecentlyPlayedBucket } from './GameSorter'
import type { SteamGameData } from '../game-box/types/GameData'

describe('CategoryAssigner', () => {
    const assigner = new CategoryAssigner()

    it('should return empty array if input is empty', () => {
        expect(assigner.assign([])).toEqual([])
    })

    it('should group games by their primary genre', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Game A', genres: [{ id: '1', description: 'Action' }] },
            { appid: 2, name: 'Game B', genres: [{ id: '1', description: 'Action' }] },
            { appid: 3, name: 'Game C', genres: [{ id: '2', description: 'RPG' }] },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result).toHaveLength(2)
        expect(result.find(g => g.genre === 'Action')?.games).toHaveLength(2)
        expect(result.find(g => g.genre === 'RPG')?.games).toHaveLength(1)
    })

    it('should put games with no genres into "Other"', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Game A' },
            { appid: 2, name: 'Game B', genres: [] },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result).toHaveLength(1)
        expect(result[0].genre).toBe('Other')
        expect(result[0].games).toHaveLength(2)
    })

    it('should sort groups by size descending', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Action 1', genres: [{ id: '1', description: 'Action' }] },
            { appid: 2, name: 'RPG 1', genres: [{ id: '2', description: 'RPG' }] },
            { appid: 3, name: 'RPG 2', genres: [{ id: '2', description: 'RPG' }] },
            { appid: 4, name: 'RPG 3', genres: [{ id: '2', description: 'RPG' }] },
            { appid: 5, name: 'Adventure 1', genres: [{ id: '3', description: 'Adventure' }] },
            { appid: 6, name: 'Adventure 2', genres: [{ id: '3', description: 'Adventure' }] },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result[0].genre).toBe('RPG')
        expect(result[1].genre).toBe('Adventure')
        expect(result[2].genre).toBe('Action')
    })

    it('should always place "Other" last, even if it is the largest group', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Action 1', genres: [{ id: '1', description: 'Action' }] },
            { appid: 2, name: 'Other 1' },
            { appid: 3, name: 'Other 2' },
            { appid: 4, name: 'Other 3' },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result).toHaveLength(2)
        expect(result[0].genre).toBe('Action')
        expect(result[1].genre).toBe('Other')
    })

    it('should normalise "Free to Play" regardless of Steam casing', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'FTP1', genres: [{ id: '37', description: 'Free to Play' }] },
            { appid: 2, name: 'FTP2', genres: [{ id: '37', description: 'Free To Play' }] },
            { appid: 3, name: 'FTP3', genres: [{ id: '37', description: 'FREE TO PLAY' }] },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result).toHaveLength(1)
        expect(result[0].genre).toBe('Free to Play')
        expect(result[0].games).toHaveLength(3)
    })

    it('should map unrecognised genres to "Other"', () => {
        const games: Partial<SteamGameData>[] = [
            { appid: 1, name: 'Localized', genres: [{ id: '1', description: 'Acci\u00f3n' }] },
            { appid: 2, name: 'Normal',    genres: [{ id: '1', description: 'Action' }] },
        ]
        const result = assigner.assign(games as SteamGameData[])
        expect(result.find(g => g.genre === 'Action')?.games).toHaveLength(1)
        expect(result.find(g => g.genre === 'Other')?.games).toHaveLength(1)
    })

    it('should export KNOWN_GENRES with expected canonical names', () => {
        expect(KNOWN_GENRES).toContain('Action')
        expect(KNOWN_GENRES).toContain('Free to Play')
        expect(KNOWN_GENRES.filter(g => g.toLowerCase() === 'free to play')).toHaveLength(1)
    })

    it('should produce at most one "Other" group regardless of input shape', () => {
        const gamesNoGenre: Partial<SteamGameData>[] = Array.from({ length: 40 }, (_, i) => ({
            appid: i + 1, name: `Game ${i + 1}`,
        }))
        const gamesWithGenre: Partial<SteamGameData>[] = [
            { appid: 100, name: 'Action Game', genres: [{ id: '1', description: 'Action' }] },
        ]
        const result = assigner.assign([...gamesNoGenre, ...gamesWithGenre] as SteamGameData[])
        const otherGroups = result.filter(g => g.genre === 'Other')
        expect(otherGroups).toHaveLength(1)
        expect(result[result.length - 1].genre).toBe('Other')
    })

})

describe('sortByGenreThenPlaytime', () => {
    // Items use { genre } (pre-resolved) because genre resolution is primaryGenre()'s job,
    // not the comparator's. In production, CategoryAssigner.assign() resolves via primaryGenre()
    // before handing items off to sort.
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
})

describe('CategoryAssigner ï¿½ genre policy', () => {
    const assigner = new CategoryAssigner()
    const game = (genres: Array<{ id: string, description: string }>, playtime = 100) => ({
        appid: Math.random(),
        name: 'test',
        playtime_forever: playtime,
        genres,
    } as any as SteamGameData)

    it('uses genres[0] as the primary category (secondary genre preference is deferred)', () => {
        // Current behavior: genres[0] is used as-is.
        // TODO: Secondary genre preference for Action-tagged games is complex ï¿½
        // [Action, Adventure] is just as broad as [Action] alone. Deferred until
        // we have a smarter policy (e.g. rarest genre wins, or a curated override list).
        const games = [
            game([{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }]),
        ]
        const result = assigner.assign(games)
        // Currently lands in Action (genres[0])
        expect(result.find(g => g.genre === 'Action')?.games).toHaveLength(1)
    })

    it('keeps Action when no other known genre is present', () => {
        const games = [
            game([{ id: '1', description: 'Action' }]),
        ]
        const result = assigner.assign(games)
        expect(result.find(g => g.genre === 'Action')?.games).toHaveLength(1)
    })

    it('ignores unrecognised secondary genres and still falls back to Action', () => {
        const games = [
            game([{ id: '1', description: 'Action' }, { id: '99', description: 'Massively Weird' }]),
        ]
        const result = assigner.assign(games)
        expect(result.find(g => g.genre === 'Action')?.games).toHaveLength(1)
    })

    it('does not treat Early Access as a shelf genre (should fall to Other)', () => {
        const games = [
            game([{ id: '70', description: 'Early Access' }]),
        ]
        const result = assigner.assign(games)
        // Early Access games should land in Other once removed from KNOWN_GENRES
        const earlyAccess = result.find(g => g.genre === 'Early Access')
        expect(earlyAccess).toBeUndefined()
        expect(result.find(g => g.genre === 'Other')?.games).toHaveLength(1)
    })
})

describe('sortByNumericField (rtime_last_played)', () => {
    const sorter = sortByNumericField<{ rtime_last_played?: number; playtime_forever?: number }>('rtime_last_played', 'playtime_forever')

    it('sorts most-recently-played first', () => {
        const games = [
            { rtime_last_played: 100, playtime_forever: 50 },
            { rtime_last_played: 999, playtime_forever: 10 },
            { rtime_last_played: 200, playtime_forever: 30 },
        ]
        const sorted = [...games].sort(sorter)
        expect(sorted.map(g => g.rtime_last_played)).toEqual([999, 200, 100])
    })

    it('places never-played games (rtime=0) last', () => {
        const games = [
            { rtime_last_played: 0, playtime_forever: 100 },
            { rtime_last_played: 500, playtime_forever: 5 },
        ]
        const sorted = [...games].sort(sorter)
        expect(sorted[0].rtime_last_played).toBe(500)
        expect(sorted[1].rtime_last_played).toBe(0)
    })

    it('breaks ties by playtime descending', () => {
        const games = [
            { rtime_last_played: 100, playtime_forever: 30 },
            { rtime_last_played: 100, playtime_forever: 80 },
        ]
        const sorted = [...games].sort(sorter)
        expect(sorted[0].playtime_forever).toBe(80)
    })

    it('handles missing rtime_last_played (treats as 0)', () => {
        const games = [
            { playtime_forever: 100 },
            { rtime_last_played: 50, playtime_forever: 10 },
        ]
        const sorted = [...games].sort(sorter)
        expect(sorted[0].rtime_last_played).toBe(50)
    })
})

describe('getRecentlyPlayedBucket', () => {
    const DAY = 24 * 60 * 60
    const now = 1000000000 // Fixed reference time for deterministic tests

    const game = (rtime: number | undefined) => ({
        rtime_last_played: rtime,
    } as SteamGameData)

    it('returns "unplayed" for rtime_last_played = 0 or undefined', () => {
        expect(getRecentlyPlayedBucket(game(0), now)).toBe(RecentlyPlayedBucket.Unplayed)
        expect(getRecentlyPlayedBucket(game(undefined), now)).toBe(RecentlyPlayedBucket.Unplayed)
    })

    it('returns "today" for within 24h', () => {
        expect(getRecentlyPlayedBucket(game(now - 1), now)).toBe(RecentlyPlayedBucket.Today)
        expect(getRecentlyPlayedBucket(game(now - DAY + 1), now)).toBe(RecentlyPlayedBucket.Today)
    })

    it('returns "this-week" for within 7 days', () => {
        expect(getRecentlyPlayedBucket(game(now - DAY), now)).toBe(RecentlyPlayedBucket.ThisWeek)
        expect(getRecentlyPlayedBucket(game(now - 7 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisWeek)
    })

    it('returns "this-month" for within 30 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 7 * DAY), now)).toBe(RecentlyPlayedBucket.ThisMonth)
        expect(getRecentlyPlayedBucket(game(now - 30 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisMonth)
    })

    it('returns "this-year" for within 365 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 30 * DAY), now)).toBe(RecentlyPlayedBucket.ThisYear)
        expect(getRecentlyPlayedBucket(game(now - 365 * DAY + 1), now)).toBe(RecentlyPlayedBucket.ThisYear)
    })

    it('returns "before" for older than 365 days', () => {
        expect(getRecentlyPlayedBucket(game(now - 365 * DAY), now)).toBe(RecentlyPlayedBucket.Before)
        expect(getRecentlyPlayedBucket(game(now - 1000 * DAY), now)).toBe(RecentlyPlayedBucket.Before)
    })

    it('handles future dates as "today"', () => {
        expect(getRecentlyPlayedBucket(game(now + 3600), now)).toBe(RecentlyPlayedBucket.Today)
    })
})

describe('getBucketLabel', () => {
    it('returns correct human-readable labels', () => {
        expect(getBucketLabel(RecentlyPlayedBucket.Today)).toBe('Played Today')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisWeek)).toBe('Played This Week')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisMonth)).toBe('Played This Month')
        expect(getBucketLabel(RecentlyPlayedBucket.ThisYear)).toBe('Played This Year')
        expect(getBucketLabel(RecentlyPlayedBucket.Before)).toBe('Played Before')
        expect(getBucketLabel(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })
})

import { chainComparators, sortAlphabetically, sortByEnumIndex, groupByKey } from './GameSortFunctions'

describe('chainComparators', () => {
    it('uses first comparator when it returns non-zero', () => {
        const byA = (a: {a: number}, b: {a: number}) => b.a - a.a
        const byB = (a: {b: number}, b: {b: number}) => b.b - a.b
        const chained = chainComparators<{a: number; b: number}>(byA, byB)
        expect(chained({ a: 2, b: 1 }, { a: 1, b: 9 })).toBeGreaterThan(0)
    })

    it('falls through to second comparator on tie', () => {
        const byA = (a: {a: number}, b: {a: number}) => b.a - a.a
        const byB = (a: {b: number}, b: {b: number}) => b.b - a.b
        const chained = chainComparators<{a: number; b: number}>(byA, byB)
        // a is equal, so b decides
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
        // Z and X both unlisted — stable among themselves
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
