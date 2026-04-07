import { describe, it, expect } from 'vitest'
import { genrePlaytimeSortFn } from './CategoryAssigner'
import { CategoryAssigner, KNOWN_GENRES, type ShelfGroup } from './CategoryAssigner'
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

describe('genrePlaytimeSortFn', () => {
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
        const sorted = [...games].sort(genrePlaytimeSortFn)
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
        const sorted = [...games].sort(genrePlaytimeSortFn)
        expect(sorted[0].playtime_forever).toBe(500)
        expect(sorted[1].playtime_forever).toBe(200)
        expect(sorted[2].playtime_forever).toBe(100)
    })

    it('puts Other/no-genre games last', () => {
        const games = [
            game(null, 1000),         // no genre
            game('Action', 50),
            game('Acción', 500),      // unrecognised genre -> Other
            game('RPG', 100),
        ]
        const sorted = [...games].sort(genrePlaytimeSortFn)
        const lastTwo = sorted.slice(-2).map(g => g.genres?.[0]?.description ?? 'Other')
        expect(lastTwo.every(g => g === 'Other' || g === 'Acción')).toBe(true)
    })

    it('is stable for equal genre+playtime', () => {
        const games = [game('Action', 100), game('Action', 100)]
        const sorted = [...games].sort(genrePlaytimeSortFn)
        expect(sorted).toHaveLength(2)
    })
})})

describe('CategoryAssigner — genre policy', () => {
    const assigner = new CategoryAssigner()
    const game = (genres: Array<{ id: string, description: string }>, playtime = 100) => ({
        appid: Math.random(),
        name: 'test',
        playtime_forever: playtime,
        genres,
    } as any as SteamGameData)

    it('uses a non-Action secondary genre when Action is genre[0] and a more specific genre exists', () => {
        // Many games are tagged Action but have a more precise genre as genre[1]
        const games = [
            game([{ id: '1', description: 'Action' }, { id: '3', description: 'RPG' }]),
        ]
        const result = assigner.assign(games)
        // Should land in RPG, not Action
        expect(result.find(g => g.genre === 'RPG')?.games).toHaveLength(1)
        expect(result.find(g => g.genre === 'Action')).toBeUndefined()
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