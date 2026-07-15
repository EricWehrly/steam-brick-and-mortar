import { describe, expect, it } from 'vitest'
import { computeAvailableDimensions } from '../../../src/ui/TaxonomyOptionAvailability'
import { GroupModes, SortModes } from '../../../src/types/LayoutTypes'
import type { SteamGameData } from '../../../src/scene/game-box/types/GameData'

function game(partial: Partial<SteamGameData>): SteamGameData {
    return {
        appid: partial.appid ?? 0,
        name: partial.name ?? 'Test',
        playtime_forever: partial.playtime_forever ?? 0,
        ...partial,
    }
}

describe('computeAvailableDimensions', () => {
    it('always includes None/ByPlaytime group and Alphabetical/ByPlaytime sort, even with zero games', () => {
        const { groupModes, sortModes } = computeAvailableDimensions([])
        expect(groupModes.has(GroupModes.None)).toBe(true)
        expect(groupModes.has(GroupModes.ByPlaytime)).toBe(true)
        expect(sortModes.has(SortModes.Alphabetical)).toBe(true)
        expect(sortModes.has(SortModes.ByPlaytime)).toBe(true)
        expect(groupModes.size).toBe(2)
        expect(sortModes.size).toBe(2)
    })

    it('adds ByRecency/ByLastPlayed only when a game has been played', () => {
        const withPlaytime = computeAvailableDimensions([game({ rtime_last_played: 12345 })])
        expect(withPlaytime.groupModes.has(GroupModes.ByRecency)).toBe(true)
        expect(withPlaytime.sortModes.has(SortModes.ByLastPlayed)).toBe(true)

        const withoutPlaytime = computeAvailableDimensions([game({ rtime_last_played: 0 })])
        expect(withoutPlaytime.groupModes.has(GroupModes.ByRecency)).toBe(false)
        expect(withoutPlaytime.sortModes.has(SortModes.ByLastPlayed)).toBe(false)
    })

    it('adds ByGenre only when a game has genres', () => {
        const { groupModes } = computeAvailableDimensions([
            game({ genres: [{ id: '1', description: 'Action' }] }),
        ])
        expect(groupModes.has(GroupModes.ByGenre)).toBe(true)
        expect(computeAvailableDimensions([game({})]).groupModes.has(GroupModes.ByGenre)).toBe(false)
    })

    it('adds ByTag when steamspy_top_tags or a positive-weighted steamspy_tags entry exists', () => {
        expect(computeAvailableDimensions([game({ steamspy_top_tags: ['Action'] })]).groupModes.has(GroupModes.ByTag)).toBe(true)
        expect(computeAvailableDimensions([game({ steamspy_tags: { Action: 10 } })]).groupModes.has(GroupModes.ByTag)).toBe(true)
        expect(computeAvailableDimensions([game({ steamspy_tags: { Action: 0 } })]).groupModes.has(GroupModes.ByTag)).toBe(false)
        expect(computeAvailableDimensions([game({})]).groupModes.has(GroupModes.ByTag)).toBe(false)
    })

    it('adds ByRating group and sort only when userscore is present (even 0)', () => {
        const { groupModes, sortModes } = computeAvailableDimensions([game({ userscore: 0 })])
        expect(groupModes.has(GroupModes.ByRating)).toBe(true)
        expect(sortModes.has(SortModes.ByRating)).toBe(true)
        expect(computeAvailableDimensions([game({})]).groupModes.has(GroupModes.ByRating)).toBe(false)
    })

    it('adds ByUserCollection only when a game has user_collections', () => {
        expect(computeAvailableDimensions([game({ user_collections: [{ id: 'ze-done', name: 'Ze Done' }] })]).groupModes.has(GroupModes.ByUserCollection)).toBe(true)
        expect(computeAvailableDimensions([game({ user_collections: [] })]).groupModes.has(GroupModes.ByUserCollection)).toBe(false)
        expect(computeAvailableDimensions([game({})]).groupModes.has(GroupModes.ByUserCollection)).toBe(false)
    })

    it('aggregates across the whole list - one game with data is enough for the whole dimension', () => {
        const games = [
            game({ appid: 1 }),
            game({ appid: 2, genres: [{ id: '1', description: 'Action' }] }),
            game({ appid: 3 }),
        ]
        expect(computeAvailableDimensions(games).groupModes.has(GroupModes.ByGenre)).toBe(true)
    })
})
