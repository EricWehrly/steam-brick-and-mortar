/**
 * TimeBucketSignHelpers unit tests
 */
import { describe, it, expect } from 'vitest'
import {
    shelfBucketKey,
    shouldPlaceBucketSign,
} from '../../../../src/scene/signs/TimeBucketSignHelpers'
import { RecentlyPlayedBucket, PlaytimeBucket } from '../../../../src/scene/categorization/GameSorter'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

const NOW = Math.floor(Date.now() / 1000)
const DAY = 24 * 60 * 60

function gameWithLastPlayed(unixSeconds: number, playtimeMinutes = 60): SteamGameData {
    return {
        appid: Math.floor(Math.random() * 1e6),
        name: 'Game',
        playtime_forever: playtimeMinutes,
        rtime_last_played: unixSeconds,
        genres: [{ id: '1', description: 'Action' }],
    } as SteamGameData
}

describe('shelfBucketKey — recently-played', () => {
    it('returns null when shelf index is out of range', () => {
        const games = [gameWithLastPlayed(NOW - DAY)]
        expect(shelfBucketKey(1, games, 'recently-played')).toBeNull()
    })

    it('returns the recency bucket key for the first game on the shelf', () => {
        const games: SteamGameData[] = Array.from({ length: 18 }, () => gameWithLastPlayed(NOW - DAY))
        games.push(gameWithLastPlayed(0))

        expect(shelfBucketKey(0, games, 'recently-played')).toBe(RecentlyPlayedBucket.ThisWeek)
        expect(shelfBucketKey(1, games, 'recently-played')).toBe(RecentlyPlayedBucket.Unplayed)
    })
})

describe('shelfBucketKey — by-playtime', () => {
    it('returns null when shelf index is out of range', () => {
        const games = [gameWithLastPlayed(NOW, 600)]
        expect(shelfBucketKey(1, games, 'by-playtime')).toBeNull()
    })

    it('returns the playtime bucket key for the first game on the shelf', () => {
        const games: SteamGameData[] = Array.from({ length: 18 }, () => gameWithLastPlayed(NOW, 6_001))
        games.push(gameWithLastPlayed(NOW, 0))

        expect(shelfBucketKey(0, games, 'by-playtime')).toBe(PlaytimeBucket.Heavy)
        expect(shelfBucketKey(1, games, 'by-playtime')).toBe(PlaytimeBucket.Unplayed)
    })
})

describe('shelfBucketKey — by-genre', () => {
    it('returns null for genre sort (no bucket concept)', () => {
        const games = [gameWithLastPlayed(NOW)]
        expect(shelfBucketKey(0, games, 'by-genre')).toBeNull()
    })
})

describe('shouldPlaceBucketSign', () => {
    it('returns false when key is null', () => {
        expect(shouldPlaceBucketSign(null, null)).toBe(false)
    })

    it('returns false when key equals lastPlacedKey (no transition)', () => {
        expect(shouldPlaceBucketSign('this-week', 'this-week')).toBe(false)
    })

    it('returns true when key transitions', () => {
        expect(shouldPlaceBucketSign('this-week', 'this-month')).toBe(true)
    })

    it('returns true when transitioning from null', () => {
        expect(shouldPlaceBucketSign('this-week', null)).toBe(true)
    })
})
