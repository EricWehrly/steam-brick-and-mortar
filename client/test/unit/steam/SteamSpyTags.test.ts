import { describe, expect, it } from 'vitest'
import { getTopSteamSpyTags } from '../../../src/steam/utils/SteamSpyTags'

describe('getTopSteamSpyTags', () => {
    it('returns top tags sorted by score descending', () => {
        const tags = {
            Indie: 42,
            Action: 120,
            Strategy: 88,
        }

        expect(getTopSteamSpyTags(tags)).toEqual(['Action', 'Strategy', 'Indie'])
    })

    it('uses alphabetical tie-breaker when scores match', () => {
        const tags = {
            Zombies: 10,
            Arcade: 10,
            BattleRoyale: 10,
        }

        expect(getTopSteamSpyTags(tags)).toEqual(['Arcade', 'BattleRoyale', 'Zombies'])
    })

    it('returns only top 5 tags by default', () => {
        const tags = {
            Tag1: 100,
            Tag2: 90,
            Tag3: 80,
            Tag4: 70,
            Tag5: 60,
            Tag6: 50,
        }

        expect(getTopSteamSpyTags(tags)).toEqual(['Tag1', 'Tag2', 'Tag3', 'Tag4', 'Tag5'])
    })

    it('returns empty array for missing tags', () => {
        expect(getTopSteamSpyTags(undefined)).toEqual([])
    })
})
