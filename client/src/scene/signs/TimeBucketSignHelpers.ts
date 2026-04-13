/**
 * TimeBucketSignHelpers
 *
 * Pure utility functions for time-bucket sign placement decisions and anchor
 * generation. Extracted from SceneSignManager to keep the manager as
 * orchestration + object lifecycle only.
 *
 * These helpers are stateless: all required context is passed in as arguments.
 * They can be unit-tested without a scene or EventManager.
 */

import { RecentlyPlayedBucket, getRecentlyPlayedBucket, getBucketLabel } from '../categorization/GameSorter'
import type { SteamGameData } from '../game-box/types/GameData'

/** Number of games packed onto a single shelf unit. */
export const SHELF_BATCH_SIZE = 18

/**
 * Determine which time bucket corresponds to the first game on a given shelf
 * (identified by batch index). Returns null if the shelf index is out of range.
 * Unplayed is a valid return value — it represents the final "Never Played" section.
 */
export function shelfBucket(
    shelfId: number,
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>
): RecentlyPlayedBucket | null {
    const firstGameIndex = shelfId * SHELF_BATCH_SIZE
    if (firstGameIndex >= sortedGames.length) return null

    return getRecentlyPlayedBucket(sortedGames[firstGameIndex] as SteamGameData)
}

/**
 * Determine whether a time-bucket sign should be placed at this shelf.
 *
 * A sign is placed when:
 * - The shelf has a non-null bucket (see shelfBucket)
 * - The bucket differs from the last placed bucket (transition boundary)
 */
export function shouldPlaceBucketSign(
    bucket: RecentlyPlayedBucket | null,
    lastPlacedBucket: RecentlyPlayedBucket | null,
): boolean {
    if (bucket === null) return false
    if (bucket === lastPlacedBucket) return false
    return true
}

/**
 * Return the display label for a bucket.
 * Unplayed maps to "Never Played" (final section in a recency sort).
 */
export function bucketDisplayLabel(bucket: RecentlyPlayedBucket): string {
    if (bucket === RecentlyPlayedBucket.Unplayed) return 'Never Played'
    return getBucketLabel(bucket)
}
