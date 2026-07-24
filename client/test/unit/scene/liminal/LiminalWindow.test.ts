import { describe, expect, it } from 'vitest'
import { LiminalWindow } from '../../../../src/scene/liminal/LiminalWindow'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

function makeGames(count: number): SteamGameData[] {
    return Array.from({ length: count }, (_, i) => ({
        appid: i + 1,
        name: `Game ${i + 1}`,
        playtime_forever: 0,
        rtime_last_played: 0,
        img_icon_url: '',
        img_logo_url: '',
    } as SteamGameData))
}

describe('LiminalWindow', () => {
    it('returns 2 * slotsPerUnit games per depth slot, left unit first', () => {
        const games = makeGames(20)
        const window = new LiminalWindow(games, 3, 5)

        const slot0 = window.gamesForSlot(0)
        expect(slot0).toHaveLength(6)
        expect(slot0.map(g => g.appid)).toEqual([1, 2, 3, 4, 5, 6])

        const slot1 = window.gamesForSlot(1)
        expect(slot1.map(g => g.appid)).toEqual([7, 8, 9, 10, 11, 12])
    })

    it('wraps around the library when the window outruns the library size', () => {
        const games = makeGames(5)
        const window = new LiminalWindow(games, 3, 5)

        const slot1 = window.gamesForSlot(1)
        // base = 1 * 6 = 6, wraps mod 5: 6,7,8,9,10,11 -> 1,2,3,4,0,1
        expect(slot1.map(g => g.appid)).toEqual([2, 3, 4, 5, 1, 2])
    })

    it('returns empty slots for an empty library', () => {
        const window = new LiminalWindow([], 3, 5)
        expect(window.gamesForSlot(0)).toEqual([])
        expect(window.allWindowGames()).toEqual([])
    })

    it('allWindowGames concatenates every depth slot in order', () => {
        const games = makeGames(20)
        const window = new LiminalWindow(games, 3, 5)

        const all = window.allWindowGames()
        expect(all).toHaveLength(5 * 2 * 3)
        expect(all.slice(0, 6).map(g => g.appid)).toEqual([1, 2, 3, 4, 5, 6])
    })
})
