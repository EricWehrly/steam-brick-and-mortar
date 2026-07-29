/**
 * Client-side cache for Steam app details (categories, genres, artwork URLs, etc.), backed by
 * IndexedDB for persistence across sessions. Static facade over a single IndexedDbCache instance
 * - there is exactly one of these, not one per caller (see mergeMany's doc comment for why that
 * matters beyond tidiness).
 */

import type { AppDetailsData } from '../batch/BatchAppDetailsClient'
import { IndexedDbCache, type IndexedDbCacheResult } from './IndexedDbCache'

/**
 * Result of a cache lookup for app details.
 * Merges the data payload with staleness metadata.
 */
export interface AppDetailsCacheResult extends AppDetailsData {
    isStale: boolean
}

export class AppDetailsCache {
    // Increment this when the required payload changes (e.g. adding steamspy tags)
    // Entries with missing or older schema versions will be treated as cache misses
    public static readonly CURRENT_SCHEMA_VERSION = 2

    private static store = AppDetailsCache.createStore()

    private static createStore(): IndexedDbCache<AppDetailsData> {
        return new IndexedDbCache<AppDetailsData>({
            dbName: 'steam-app-details-cache',
            storeName: 'appdetails',
            keyPath: 'appid',
            dbVersion: 1,
            currentSchemaVersion: AppDetailsCache.CURRENT_SCHEMA_VERSION,
        })
    }

    /** For testing - forces the next call to open a fresh IndexedDB connection, so a per-test
     *  mock (see test/mocks/indexeddb.mock.ts) doesn't get bypassed by an already-open handle
     *  left over from a previous test. */
    public static resetForTesting(): void {
        AppDetailsCache.store = AppDetailsCache.createStore()
    }

    static async get(appid: number): Promise<AppDetailsCacheResult | null> {
        const result = await AppDetailsCache.store.get(appid)
        return result ? AppDetailsCache.toCacheResult(result) : null
    }

    static async getMany(appids: number[]): Promise<Map<number, AppDetailsCacheResult>> {
        const results = await AppDetailsCache.store.getMany(appids)
        return AppDetailsCache.toCacheResultMap(results)
    }

    /** Full-store scan: fine at current cache size (a few thousand entries). Callers filter/interpret the results. */
    static async getAllEntries(): Promise<Map<number, AppDetailsCacheResult>> {
        const results = await AppDetailsCache.store.getAllEntries()
        return AppDetailsCache.toCacheResultMap(results)
    }

    /**
     * Given a candidate appid list, returns just the ones with no cache entry at all - "give me
     * what's not already in the library." Used by LocalSteamLibraryLoader to find
     * collection-referenced appids that need a network gap-fill fetch, but generic enough for
     * any other caller with the same "what haven't we seen yet" question.
     */
    static async findMissing(appids: number[]): Promise<number[]> {
        const cached = await AppDetailsCache.getMany(appids)
        return appids.filter(appid => !cached.has(appid))
    }

    /**
     * Like findMissing, but "missing" means "still needs a real network appdetails fetch to get
     * real artwork/header/capsule URLs" rather than just "has no entry at all." An appid can have
     * an entry already - LocalSteamDataWriter's local-only appinfo.vdf resolution always writes
     * one, with null artwork - without ever having been checked against the network, which is the
     * only source that can supply real header_image/capsule_image URLs. Without this distinction,
     * findMissing's plain "has any entry" check is permanently satisfied by the local-only write,
     * and the appid never gets a real artwork fetch. See
     * docs/plans/startup-artwork-resolution-plan.md, Root Cause A.
     */
    static async findMissingArtwork(appids: number[]): Promise<number[]> {
        const cached = await AppDetailsCache.getMany(appids)
        return appids.filter(appid => !cached.get(appid)?.artwork_network_checked)
    }

    /**
     * The full set of artwork URLs already confirmed dead for this appid. Read once per
     * resolution attempt (not once per candidate URL) - see GameArtworkProvider.
     */
    static async getDeadArtworkPaths(appid: number): Promise<ReadonlySet<string>> {
        const entry = await AppDetailsCache.get(appid)
        return new Set(entry?.artwork_dead_paths ?? [])
    }

    /**
     * Records one more dead artwork URL for an appid - merged, not overwritten, so it can't lose
     * anything else already known about this appid (and mergeMany's union semantics for this
     * field mean it can't lose a dead path a concurrent writer just recorded either). No-ops if
     * there's no existing entry at all - an appid nothing else is known about yet isn't worth
     * creating a shell record just to hold one dead URL; the fetch simply gets re-attempted (and
     * re-fails, harmlessly) until something else gives it a real entry.
     */
    static async markArtworkPathDead(appid: number, url: string): Promise<void> {
        const existing = await AppDetailsCache.get(appid)
        if (!existing) return
        if (existing.artwork_dead_paths?.includes(url)) return

        const incoming: AppDetailsData = {
            type: existing.type,
            name: existing.name,
            artwork: existing.artwork,
            artwork_dead_paths: [url],
        }
        await AppDetailsCache.mergeMany(new Map([[appid, incoming]]), Date.now())
    }

    static async set(appid: number, data: AppDetailsData): Promise<void> {
        return AppDetailsCache.store.set(appid, data)
    }

    /** Unconditional overwrite - use this for a source that's always authoritative (a real
     *  network fetch). For a source that might be racing another writer over the same appids
     *  (e.g. local-scan vs. the baked-cache seed), use mergeMany instead. */
    static async setMany(dataMap: Map<number, AppDetailsData>): Promise<void> {
        return AppDetailsCache.store.setMany(dataMap)
    }

    /**
     * Merges incoming data into whatever's already cached, per appid, per field - instead of one
     * writer's data blindly overwriting another's. This is what lets the baked-cache seed and
     * local-scan's disk read both write into this cache with no ordering requirement between
     * them: whichever lands first, lands safely, and the other only ever improves the record.
     * (Previously this was handled by making callers await a readiness event before writing -
     * see the git history around SteamEventTypes.AppDetailsCacheSeeded. That's gone; this method
     * is the actual fix, not a event-ordering workaround.)
     *
     * `sourceTimestamp` is the caller's own notion of "when was this batch of data captured" -
     * not necessarily "now." A field from `dataMap` wins over the existing cached value when it's
     * meaningful (see isFieldMeaningful) AND either the existing field isn't meaningful or this
     * source is at least as new as the cached record's own timestamp. The merged record's stored
     * cached_at becomes whichever of the two timestamps is newer, so a *third* future merge can
     * still compare correctly against "the newest contribution actually in this record" - not
     * just "whenever a merge last touched it."
     */
    static async mergeMany(dataMap: Map<number, AppDetailsData>, sourceTimestamp: number): Promise<void> {
        if (dataMap.size === 0) return

        const existing = await AppDetailsCache.store.getMany([...dataMap.keys()])
        const merged = new Map<number, { data: AppDetailsData; cachedAt: number }>()

        for (const [appid, incoming] of dataMap.entries()) {
            const existingResult = existing.get(appid)
            if (!existingResult) {
                merged.set(appid, { data: incoming, cachedAt: sourceTimestamp })
                continue
            }

            const incomingIsAtLeastAsNew = sourceTimestamp >= existingResult.cachedAt
            merged.set(appid, {
                data: mergeAppDetails(incoming, existingResult.data, incomingIsAtLeastAsNew),
                cachedAt: Math.max(sourceTimestamp, existingResult.cachedAt),
            })
        }

        await AppDetailsCache.store.setManyWithTimestamps(merged)
    }

    static async clear(): Promise<void> {
        return AppDetailsCache.store.clear()
    }

    static async getStats(): Promise<{ count: number; oldestEntry: number | null; newestEntry: number | null }> {
        return AppDetailsCache.store.getStats()
    }

    private static toCacheResult(result: IndexedDbCacheResult<AppDetailsData>): AppDetailsCacheResult {
        return { ...result.data, isStale: result.isStale }
    }

    private static toCacheResultMap(
        results: Map<number, IndexedDbCacheResult<AppDetailsData>>
    ): Map<number, AppDetailsCacheResult> {
        const out = new Map<number, AppDetailsCacheResult>()
        for (const [appid, result] of results.entries()) {
            out.set(appid, AppDetailsCache.toCacheResult(result))
        }
        return out
    }
}

// ─── Merge rules ──────────────────────────────────────────────────────────────
//
// Per-field, not a blind deep-merge: several fields have legitimately meaningful falsy/zero
// values that a naive "is it truthy" check would wrongly treat as absent (is_free's real value
// can be false; positive/negative/userscore's real value can be 0). "Meaningful" is judged per
// field's own shape, not generically inferred.

const isNonEmptyString = (value: unknown): boolean => typeof value === 'string' && value.length > 0
const isNonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0
const isNonEmptyRecord = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && Object.keys(value).length > 0
const isDefined = (value: unknown): boolean => value !== undefined && value !== null

/**
 * Union, not prefer-newer - unlike every other field here, losing a known-dead path is a real
 * regression (it means re-attempting a URL already confirmed dead), not just stale data. Two
 * independent writers discovering different dead paths for the same appid must both survive a
 * merge regardless of which one is "newer."
 */
function unionStringArrays(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
    if (!a?.length) return b?.length ? b : undefined
    if (!b?.length) return a
    return [...new Set([...a, ...b])]
}

/**
 * Picks incoming over existing when incoming is meaningful and (incoming is at least as new, or
 * existing isn't meaningful either); otherwise keeps existing; falls back to `undefined` only
 * when neither side has anything. `isMeaningful` takes `unknown` (not `T`) deliberately - it's a
 * plain presence/shape check, not a real type guard, so it stays trivially assignable regardless
 * of what T is inferred as at each call site.
 */
function preferField<T>(
    incoming: T | null | undefined,
    existing: T | null | undefined,
    incomingIsAtLeastAsNew: boolean,
    isMeaningful: (value: unknown) => boolean
): T | undefined {
    const incomingMeaningful = isMeaningful(incoming)
    const existingMeaningful = isMeaningful(existing)

    if (incomingMeaningful && (incomingIsAtLeastAsNew || !existingMeaningful)) {
        return incoming as T
    }
    if (existingMeaningful) {
        return existing as T
    }
    return undefined
}

function mergeAppDetails(
    incoming: AppDetailsData,
    existing: AppDetailsData,
    incomingIsAtLeastAsNew: boolean
): AppDetailsData {
    const prefer = <T>(a: T | null | undefined, b: T | null | undefined, isMeaningful: (v: unknown) => boolean) =>
        preferField(a, b, incomingIsAtLeastAsNew, isMeaningful)

    return {
        ...existing,
        ...incoming,
        // name/type are required on the interface; both writers already guard against writing an
        // entry with no name at all, so an empty string here should be unreachable in practice -
        // the fallback only exists so this satisfies the non-optional field types.
        name: prefer(incoming.name, existing.name, isNonEmptyString) ?? '',
        type: prefer(incoming.type, existing.type, isNonEmptyString) ?? '',
        is_free: prefer(incoming.is_free, existing.is_free, isDefined),
        artwork: {
            header: prefer(incoming.artwork.header, existing.artwork.header, isDefined) ?? null,
            capsule: prefer(incoming.artwork.capsule, existing.artwork.capsule, isDefined) ?? null,
            capsule_v5: prefer(incoming.artwork.capsule_v5, existing.artwork.capsule_v5, isDefined) ?? null,
            background: prefer(incoming.artwork.background, existing.artwork.background, isDefined) ?? null,
            background_raw: prefer(incoming.artwork.background_raw, existing.artwork.background_raw, isDefined) ?? null,
        },
        developers: prefer(incoming.developers, existing.developers, isNonEmptyArray),
        publishers: prefer(incoming.publishers, existing.publishers, isNonEmptyArray),
        genres: prefer(incoming.genres, existing.genres, isNonEmptyArray),
        categories: prefer(incoming.categories, existing.categories, isNonEmptyArray),
        user_collections: prefer(incoming.user_collections, existing.user_collections, isNonEmptyArray),
        steamspy_tags: prefer(incoming.steamspy_tags, existing.steamspy_tags, isNonEmptyRecord),
        steamspy_top_tags: prefer(incoming.steamspy_top_tags, existing.steamspy_top_tags, isNonEmptyArray),
        owners: prefer(incoming.owners, existing.owners, isNonEmptyString),
        short_description: prefer(incoming.short_description, existing.short_description, isNonEmptyString),
        full_data: prefer(incoming.full_data, existing.full_data, isDefined),
        undesirable_for_demo: prefer(incoming.undesirable_for_demo, existing.undesirable_for_demo, isDefined),
        artwork_dead_paths: unionStringArrays(incoming.artwork_dead_paths, existing.artwork_dead_paths),
        release_date: prefer(incoming.release_date, existing.release_date, isDefined),
        metacritic: prefer(incoming.metacritic, existing.metacritic, isDefined),
        // positive/negative/userscore: 0 is treated as a meaningful, real value (not "never
        // fetched") - this assumes no writer ever uses 0 as a placeholder default for these the
        // way LocalSteamDataWriter used to for is_free. True as of writing (only network/SteamSpy
        // hydration paths set these, and they set real values or omit the field entirely) - worth
        // re-checking if a future writer starts producing these fields too.
        positive: prefer(incoming.positive, existing.positive, isDefined),
        negative: prefer(incoming.negative, existing.negative, isDefined),
        userscore: prefer(incoming.userscore, existing.userscore, isDefined),
    }
}
