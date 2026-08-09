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

        const slot0 = window.itemsForSlot(0)
        expect(slot0).toHaveLength(6)
        expect(slot0.map(g => g.appid)).toEqual([1, 2, 3, 4, 5, 6])

        const slot1 = window.itemsForSlot(1)
        expect(slot1.map(g => g.appid)).toEqual([7, 8, 9, 10, 11, 12])
    })

    it('wraps around the library when the window outruns the library size', () => {
        const games = makeGames(5)
        const window = new LiminalWindow(games, 3, 5)

        const slot1 = window.itemsForSlot(1)
        // base = 1 * 6 = 6, wraps mod 5: 6,7,8,9,10,11 -> 1,2,3,4,0,1
        expect(slot1.map(g => g.appid)).toEqual([2, 3, 4, 5, 1, 2])
    })

    it('returns empty slots for an empty library', () => {
        const window = new LiminalWindow([], 3, 5)
        expect(window.itemsForSlot(0)).toEqual([])
        expect(window.allWindowItems()).toEqual([])
    })

    it('allWindowItems concatenates every depth slot in order', () => {
        const games = makeGames(20)
        const window = new LiminalWindow(games, 3, 5)

        const all = window.allWindowItems()
        expect(all).toHaveLength(5 * 2 * 3)
        expect(all.slice(0, 6).map(g => g.appid)).toEqual([1, 2, 3, 4, 5, 6])
    })

    // Guards the RingEntry design in docs/plans/liminal-shelf-signs-plan.md §3.1: combining game +
    // sectionName into one payload (rather than windowing two parallel arrays) makes desync
    // structurally impossible. This test documents that guarantee by windowing two independent
    // payload types over the same ring length/indices and confirming they stay in lockstep.
    it('windows two different payload types over the same indices in lockstep', () => {
        const length = 7
        const numbers = Array.from({ length }, (_, i) => ({ value: i }))
        const letters = Array.from({ length }, (_, i) => ({ letter: String.fromCharCode('a'.charCodeAt(0) + i) }))

        const numberWindow = new LiminalWindow(numbers, 2, 3)
        const letterWindow = new LiminalWindow(letters, 2, 3)

        for (let depthSlot = 0; depthSlot < 3; depthSlot++) {
            const numberSlot = numberWindow.itemsForSlot(depthSlot)
            const letterSlot = letterWindow.itemsForSlot(depthSlot)
            expect(letterSlot).toEqual(numberSlot.map(n => ({ letter: String.fromCharCode('a'.charCodeAt(0) + n.value) })))
        }
    })
})
