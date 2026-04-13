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

import { getRecentlyPlayedBucket, getBucketLabel, getPlaytimeBucket } from '../categorization/GameSorter'
import type { GameSortMode } from '../../types/EnvironmentEvents'
import type { SteamGameData } from '../game-box/types/GameData'

/** Number of games packed onto a single shelf unit. */
export const SHELF_BATCH_SIZE = 18

/**
 * Return the bucket key for the first game on a given shelf, using the
 * appropriate classifier for the active sort mode.
 * Returns null if the shelf index is out of range.
 */
export function shelfBucketKey(
    shelfId: number,
    sortedGames: ReadonlyArray<Readonly<SteamGameData>>,
    sortMode: GameSortMode,
): string | null {
    const firstGameIndex = shelfId * SHELF_BATCH_SIZE
    if (firstGameIndex >= sortedGames.length) return null
    const game = sortedGames[firstGameIndex] as SteamGameData
    switch (sortMode) {
        case 'recently-played': return getRecentlyPlayedBucket(game)
        case 'by-playtime':     return getPlaytimeBucket(game)
        default:                return null
    }
}

/**
 * Determine whether a bucket sign should be placed at this shelf.
 * A sign is placed when the bucket key differs from the last placed key.
 */
export function shouldPlaceBucketSign(
    bucketKey: string | null,
    lastPlacedKey: string | null,
): boolean {
    return bucketKey !== null && bucketKey !== lastPlacedKey
}
