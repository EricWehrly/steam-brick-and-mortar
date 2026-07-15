import { describe, expect, it } from 'vitest'
import { resolveGroups } from '../../../../src/scene/categorization/GroupResolver'
import { GroupModes, SortModes } from '../../../../src/types/LayoutTypes'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

function game(partial: Partial<SteamGameData>): SteamGameData {
    return {
        appid: partial.appid ?? 0,
        name: partial.name ?? 'Test',
        playtime_forever: partial.playtime_forever ?? 0,
        ...partial,
    }
}

describe('resolveGroups by-tag', () => {
    it('groups by each game top tags and keeps untagged games in Untagged', () => {
        const games: SteamGameData[] = [
            game({ appid: 1, name: 'Game 1', steamspy_top_tags: ['Action', 'Co-op'] }),
            game({ appid: 2, name: 'Game 2', steamspy_top_tags: ['Action', 'Roguelike'] }),
            game({ appid: 3, name: 'Game 3', steamspy_tags: { Indie: 50, Puzzle: 40 } }),
            game({ appid: 4, name: 'Game 4' }),
        ]

        const sections = resolveGroups(games, GroupModes.ByTag, SortModes.Alphabetical)
        const names = sections.map(section => section.name)

        expect(names[0]).toBe('Action')
        expect(names).not.toContain('Untagged')

        const byName = new Map(sections.map(section => [section.name, section]))
        expect(byName.get('Action')?.games).toHaveLength(2)
        expect(byName.get('Co-op')?.games).toHaveLength(1)
        expect(byName.get('Roguelike')?.games).toHaveLength(1)
        expect(byName.get('Indie')?.games).toHaveLength(1)
        expect(byName.get('Puzzle')?.games).toHaveLength(1)
    })

    it('uses precomputed steamspy_top_tags when available', () => {
        const games: SteamGameData[] = [
            game({
                appid: 11,
                name: 'Precomputed',
                steamspy_top_tags: ['OnlyTopTag'],
                steamspy_tags: { OnlyTopTag: 1, IgnoredByTopTagList: 99 },
            }),
        ]

        const sections = resolveGroups(games, GroupModes.ByTag, SortModes.Alphabetical)
        const names = sections.map(section => section.name)

        expect(names).toEqual(['OnlyTopTag'])
    })
})

describe('resolveGroups by-user-collection', () => {
    it('groups by each game user_collections membership, duplicating multi-collection games', () => {
        const games: SteamGameData[] = [
            game({ appid: 1, name: 'Game 1', user_collections: [{ id: 'ze-done', name: 'Ze Done' }, { id: 'meh', name: 'Meh' }] }),
            game({ appid: 2, name: 'Game 2', user_collections: [{ id: 'ze-done', name: 'Ze Done' }] }),
            game({ appid: 3, name: 'Game 3' }),
        ]

        const sections = resolveGroups(games, GroupModes.ByUserCollection, SortModes.Alphabetical)
        const byName = new Map(sections.map(section => [section.name, section]))

        expect(byName.get('Ze Done')?.games.map(g => g.appid)).toEqual([1, 2])
        expect(byName.get('Meh')?.games.map(g => g.appid)).toEqual([1])
        expect(sections.map(s => s.name)).not.toContain('')
    })

    it('produces no sections when no game has user_collections', () => {
        const games: SteamGameData[] = [game({ appid: 1, name: 'Game 1' })]
        const sections = resolveGroups(games, GroupModes.ByUserCollection, SortModes.Alphabetical)
        expect(sections).toHaveLength(0)
    })

    it('does not merge two different collections that happen to share a display name', () => {
        const games: SteamGameData[] = [
            game({ appid: 1, name: 'Game 1', user_collections: [{ id: 'favorites-a', name: 'Favorites' }] }),
            game({ appid: 2, name: 'Game 2', user_collections: [{ id: 'favorites-b', name: 'Favorites' }] }),
        ]

        const sections = resolveGroups(games, GroupModes.ByUserCollection, SortModes.Alphabetical)

        expect(sections).toHaveLength(2)
        expect(sections.every(section => section.name === 'Favorites')).toBe(true)
        expect(sections.flatMap(section => section.games.map(g => g.appid)).sort()).toEqual([1, 2])
    })
})
