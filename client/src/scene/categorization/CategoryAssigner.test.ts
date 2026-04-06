import { describe, it, expect } from 'vitest'
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
})
