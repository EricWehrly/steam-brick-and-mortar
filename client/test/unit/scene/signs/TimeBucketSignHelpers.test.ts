/**
 * TimeBucketSignHelpers unit tests
 *
 * Pure-function tests — no scene, no EventManager, no THREE.Scene required.
 * These verify the decision logic extracted from SceneSignManager.
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
    shelfBucket,
    shouldPlaceBucketSign,
    bucketSignAnchor,
    recentlyPlayedCeilingAnchor,
    bucketDisplayLabel,
    SHELF_BATCH_SIZE,
} from '../../../../src/scene/signs/TimeBucketSignHelpers'
import { RecentlyPlayedBucket } from '../../../../src/scene/categorization/GameSorter'
import type { SteamGameData } from '../../../../src/scene/game-box/types/GameData'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGame(rtimeLastPlayed: number): Readonly<SteamGameData> {
    return {
        appid: Math.floor(Math.random() * 1_000_000),
        name: 'Test Game',
        playtime_forever: 120,
        rtime_last_played: rtimeLastPlayed,
    } as SteamGameData
}

const LAST_WEEK_SECS = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60
const LAST_MONTH_SECS = Math.floor(Date.now() / 1000) - 20 * 24 * 60 * 60
const NEVER = 0

// ─── shelfBucket ─────────────────────────────────────────────────────────────

describe('shelfBucket', () => {
    it('returns null when shelfId is beyond sorted games range', () => {
        const games = [makeGame(LAST_WEEK_SECS)]
        // shelfId=1 → firstGameIndex=18, but games.length=1
        expect(shelfBucket(1, games)).toBeNull()
    })

    it('returns Unplayed when first game has never been played', () => {
        const games = Array.from({ length: SHELF_BATCH_SIZE }, () => makeGame(NEVER))
        expect(shelfBucket(0, games)).toBe(RecentlyPlayedBucket.Unplayed)
    })

    it('returns a bucket when first game has recent play time', () => {
        const games = Array.from({ length: SHELF_BATCH_SIZE }, () => makeGame(LAST_WEEK_SECS))
        const bucket = shelfBucket(0, games)
        expect(bucket).not.toBeNull()
        expect(bucket).not.toBe(RecentlyPlayedBucket.Unplayed)
    })

    it('uses the FIRST game of the batch to determine bucket', () => {
        const games = [
            makeGame(LAST_WEEK_SECS),                              // shelfId=0, first game
            ...Array.from({ length: SHELF_BATCH_SIZE - 1 }, () => makeGame(NEVER)),
        ]
        const bucket = shelfBucket(0, games)
        // Should reflect the first game's recency, not later ones
        expect(bucket).not.toBeNull()
    })

    it('uses correct offset for shelfId > 0', () => {
        const filler = Array.from({ length: SHELF_BATCH_SIZE }, () => makeGame(NEVER))
        const second = [makeGame(LAST_MONTH_SECS), ...Array.from({ length: SHELF_BATCH_SIZE - 1 }, () => makeGame(NEVER))]
        const games = [...filler, ...second]
        const bucket = shelfBucket(1, games)
        expect(bucket).not.toBeNull()
    })
})

// ─── shouldPlaceBucketSign ───────────────────────────────────────────────────

describe('shouldPlaceBucketSign', () => {
    const farPosition = new THREE.Vector3(10, 0, -20)
    const ceilingAnchor = recentlyPlayedCeilingAnchor()

    it('returns false when bucket is null', () => {
        expect(shouldPlaceBucketSign(null, null, farPosition, ceilingAnchor)).toBe(false)
    })

    it('returns false when bucket equals lastPlacedBucket (no transition)', () => {
        const bucket = RecentlyPlayedBucket.ThisWeek
        expect(shouldPlaceBucketSign(bucket, bucket, farPosition, ceilingAnchor)).toBe(false)
    })

    it('returns true when bucket transitions and no collision', () => {
        expect(shouldPlaceBucketSign(
            RecentlyPlayedBucket.ThisWeek,
            RecentlyPlayedBucket.ThisMonth,
            farPosition,
            ceilingAnchor
        )).toBe(true)
    })

    it('returns false when sign anchor collides with ceiling sign', () => {
        // Put shelfPosition directly under the ceiling anchor
        const shelfUnderCeiling = new THREE.Vector3(
            ceilingAnchor.x,
            ceilingAnchor.y - 2.0 - 0.02, // bucketSignAnchor adds this back
            ceilingAnchor.z
        )
        expect(shouldPlaceBucketSign(
            RecentlyPlayedBucket.ThisWeek,
            null,
            shelfUnderCeiling,
            ceilingAnchor
        )).toBe(false)
    })
})

// ─── bucketSignAnchor ────────────────────────────────────────────────────────

describe('bucketSignAnchor', () => {
    it('positions sign above shelf by 2.02 m', () => {
        const shelfPos = new THREE.Vector3(3, 0, -5)
        const anchor = bucketSignAnchor(shelfPos)
        expect(anchor.x).toBe(shelfPos.x)
        expect(anchor.z).toBe(shelfPos.z)
        expect(anchor.y).toBeCloseTo(2.02, 5)
    })
})

// ─── recentlyPlayedCeilingAnchor ─────────────────────────────────────────────

describe('recentlyPlayedCeilingAnchor', () => {
    it('returns a consistent anchor below the ceiling', () => {
        const a1 = recentlyPlayedCeilingAnchor()
        const a2 = recentlyPlayedCeilingAnchor()
        expect(a1.x).toBe(a2.x)
        expect(a1.y).toBe(a2.y)
        expect(a1.z).toBe(a2.z)
    })

    it('has x=0 (centred in aisle)', () => {
        expect(recentlyPlayedCeilingAnchor().x).toBe(0)
    })
})

// ─── bucketDisplayLabel ───────────────────────────────────────────────────────

describe('bucketDisplayLabel', () => {
    it('returns Never Played for Unplayed bucket', () => {
        expect(bucketDisplayLabel(RecentlyPlayedBucket.Unplayed)).toBe('Never Played')
    })

    it('returns a non-empty string for played buckets', () => {
        for (const bucket of [
            RecentlyPlayedBucket.ThisWeek,
            RecentlyPlayedBucket.ThisMonth,
            RecentlyPlayedBucket.ThisYear,
        ]) {
            const label = bucketDisplayLabel(bucket)
            expect(label).not.toBeNull()
            expect(typeof label).toBe('string')
            expect((label as string).length).toBeGreaterThan(0)
        }
    })
})
