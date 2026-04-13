/**
 * TimeBucketSignHelpers unit tests
 */
import { describe, it, expect } from 'vitest'
import {
    shelfBucket,
    shouldPlaceBucketSign,
    bucketDisplayLabel,
} from '../../../../src/scene/signs/TimeBucketSignHelpers'
import { RecentlyPlayedBucket } from '../../../../src/scene/categorization/GameSorter'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

const NOW = Math.floor(Date.now() / 1000)
const DAY = 24 * 60 * 60

function gameWithLastPlayed(unixSeconds: number): SteamGameData {
    return {
        appid: Math.floor(Math.random() * 1e6),
        name: 'Game',
        playtime_forever: 60,
        rtime_last_played: unixSeconds,
        genres: [{ id: '1', description: 'Action' }],
    } as SteamGameData
}

describe('shelfBucket', () => {
    it('returns null when shelf index is out of range', () => {
        const games = [gameWithLastPlayed(NOW - DAY)]
        expect(shelfBucket(1, games)).toBeNull()
    })

    it('maps shelf to first game in that shelf batch', () => {
        const games: SteamGameData[] = []
        for (let i = 0; i < 18; i++) {
            games.push(gameWithLastPlayed(NOW - DAY))
        }
        games.push(gameWithLastPlayed(0))

        expect(shelfBucket(0, games)).not.toBeNull()
        expect(shelfBucket(1, games)).toBe(RecentlyPlayedBucket.Unplayed)
    })
})

describe('shouldPlaceBucketSign', () => {
    it('returns false when bucket is null', () => {
        expect(shouldPlaceBucketSign(null, null)).toBe(false)
    })

    it('returns false when bucket equals lastPlacedBucket (no transition)', () => {
        const bucket = RecentlyPlayedBucket.ThisWeek
        expect(shouldPlaceBucketSign(bucket, bucket)).toBe(false)
    })

    it('returns true when bucket transitions', () => {
        expect(shouldPlaceBucketSign(
            RecentlyPlayedBucket.ThisWeek,
            RecentlyPlayedBucket.ThisMonth,
        )).toBe(true)
    })

    it('returns true when transitioning from null', () => {
        expect(shouldPlaceBucketSign(RecentlyPlayedBucket.ThisWeek, null)).toBe(true)
    })
})

describe('bucketDisplayLabel', () => {
    it('returns Never Played for Unplayed bucket', () => {
        expect(bucketDisplayLabel(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })

    it('returns a non-empty string for played buckets', () => {
        for (const bucket of [
            RecentlyPlayedBucket.ThisWeek,
            RecentlyPlayedBucket.ThisMonth,
            RecentlyPlayedBucket.ThisYear,
            RecentlyPlayedBucket.Before,
        ]) {
            expect(bucketDisplayLabel(bucket).length).toBeGreaterThan(0)
        }
    })
})
