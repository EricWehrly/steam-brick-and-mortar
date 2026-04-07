import { describe, it, expect } from 'vitest'
import { CategoryAssigner, KNOWN_GENRES, sortByGenreThenPlaytime, sortByRecentlyPlayed, getRecentlyPlayedBucket, getBucketLabel, RecentlyPlayedBucket, type ShelfGroup } from './CategoryAssigner'
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
    const game = (genre: string | null, playtime: number) => ({
        appid: Math.random(),
        name: `${genre}-${playtime}`,
        playtime_forever: playtime,
        genres: genre ? [{ id: '1', description: genre }] : undefined,
    } as any)

    it('groups same-genre games consecutively', () => {
        const games = [
            game('RPG', 100),
            game('Action', 500),
            game('RPG', 300),
            game('Action', 200),
        ]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        const genres = sorted.map(g => g.genres?.[0]?.description ?? 'Other')
        // First two should be the same genre, last two should be the same genre
        expect(genres[0]).toBe(genres[1])
        expect(genres[2]).toBe(genres[3])
        expect(genres[0]).not.toBe(genres[2])
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

    it('puts Other/no-genre games last', () => {
        const games = [
            game(null, 1000),         // no genre
            game('Action', 50),
            game('Acci�n', 500),      // unrecognised genre -> Other
            game('RPG', 100),
        ]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        const lastTwo = sorted.slice(-2).map(g => g.genres?.[0]?.description ?? 'Other')
        expect(lastTwo.every(g => g === 'Other' || g === 'Acci�n')).toBe(true)
    })

    it('is stable for equal genre+playtime', () => {
        const games = [game('Action', 100), game('Action', 100)]
        const sorted = [...games].sort(sortByGenreThenPlaytime)
        expect(sorted).toHaveLength(2)
    })
})

describe('CategoryAssigner � genre policy', () => {
    const assigner = new CategoryAssigner()
    const game = (genres: Array<{ id: string, description: string }>, playtime = 100) => ({
        appid: Math.random(),
        name: 'test',
        playtime_forever: playtime,
        genres,
    } as any as SteamGameData)

    it('uses genres[0] as the primary category (secondary genre preference is deferred)', () => {
        // Current behavior: genres[0] is used as-is.
        // TODO: Secondary genre preference for Action-tagged games is complex �
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

describe('sortByRecentlyPlayed', () => {
    it('sorts most-recently-played first', () => {
        const games = [
            { rtime_last_played: 100, playtime_forever: 50 },
            { rtime_last_played: 999, playtime_forever: 10 },
            { rtime_last_played: 200, playtime_forever: 30 },
        ]
        const sorted = [...games].sort(sortByRecentlyPlayed)
        expect(sorted.map(g => g.rtime_last_played)).toEqual([999, 200, 100])
    })

    it('places never-played games (rtime=0) last', () => {
        const games = [
            { rtime_last_played: 0, playtime_forever: 100 },
            { rtime_last_played: 500, playtime_forever: 5 },
        ]
        const sorted = [...games].sort(sortByRecentlyPlayed)
        expect(sorted[0].rtime_last_played).toBe(500)
        expect(sorted[1].rtime_last_played).toBe(0)
    })

    it('breaks ties by playtime descending', () => {
        const games = [
            { rtime_last_played: 100, playtime_forever: 30 },
            { rtime_last_played: 100, playtime_forever: 80 },
        ]
        const sorted = [...games].sort(sortByRecentlyPlayed)
        expect(sorted[0].playtime_forever).toBe(80)
    })

    it('handles missing rtime_last_played (treats as 0)', () => {
        const games = [
            { playtime_forever: 100 },
            { rtime_last_played: 50, playtime_forever: 10 },
        ]
        const sorted = [...games].sort(sortByRecentlyPlayed)
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
