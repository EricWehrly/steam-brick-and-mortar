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

import * as THREE from 'three'
import { RecentlyPlayedBucket, getRecentlyPlayedBucket, getBucketLabel } from '../categorization/GameSorter'
import type { SteamGameData } from '../game-box/types/GameData'
import { RoomConstants } from '../RoomManager'

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
 * - The sign anchor doesn't collide with the ceiling sign anchor
 */
export function shouldPlaceBucketSign(
    bucket: RecentlyPlayedBucket | null,
    lastPlacedBucket: RecentlyPlayedBucket | null,
    shelfPosition: THREE.Vector3,
    ceilingSignAnchor: THREE.Vector3,
    collisionRadius = 1.5
): boolean {
    if (bucket === null) return false
    if (bucket === lastPlacedBucket) return false

    const signAnchor = bucketSignAnchor(shelfPosition)
    if (ceilingSignAnchor.distanceTo(signAnchor) <= collisionRadius) return false

    return true
}

/**
 * Compute the world-space anchor position for a time-bucket sign above a shelf.
 * The sign floats slightly above the default shelf-sign height (extra 0.02 m headroom).
 */
export function bucketSignAnchor(shelfPosition: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
        shelfPosition.x,
        shelfPosition.y + 2.0 + 0.02,
        shelfPosition.z
    )
}

/**
 * Compute the world-space anchor for the ceiling "Recently Played" feature sign.
 * Kept here so both SceneSignManager and any future tests use the same source of truth.
 */
export function recentlyPlayedCeilingAnchor(): THREE.Vector3 {
    return new THREE.Vector3(0, RoomConstants.STORE_CEILING_HEIGHT - 0.5, -6.4)
}

/**
 * Return the display label for a bucket.
 * Unplayed maps to "Never Played" (final section in a recency sort).
 */
export function bucketDisplayLabel(bucket: RecentlyPlayedBucket): string {
    if (bucket === RecentlyPlayedBucket.Unplayed) return 'Never Played'
    return getBucketLabel(bucket)
}
