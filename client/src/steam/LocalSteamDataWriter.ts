/**
 * Writes locally-mined Steam data (see docs/plans/desktop-local-data-pipeline-plan.md) into the
 * same AppDetailsCache the network/Lambda path uses - the same IndexedDB store, same schema,
 * so GamesLoader's existing cache-read logic needs no changes to pick these entries up.
 *
 * No-ops entirely on the web build (isTauri() is false there).
 *
 * `is_free` is omitted, not defaulted - appinfo.vdf's local price fields aren't extracted yet, so
 * this path genuinely doesn't know. Writing `false` here would look like real data to
 * AppDetailsCache.mergeMany and could beat out a real answer from elsewhere.
 *
 * `categories`/`genres` are resolved via `TaxonomyIdResolver` from the pre-baked appdetails
 * bundle rather than a network call - see docs/plans/taxonomy-data-event-plan.md. An appid whose
 * local genre/category ids aren't covered by that bundle still writes with tags/name/developer/
 * publisher only, same as before this resolution existed - see
 * docs/tech-debt.md#id-metadata-refetch-no-circuit-breaker for the known (low-priority) gap that
 * leaves.
 *
 * The candidate appid set this class processes is `union(playtime appids, collection appids)`,
 * not playtime alone - a collection-referenced appid with no local playtime entry (owned but
 * never launched) still gets a local metadata lookup attempted. If `read_local_app_metadata` has
 * nothing for it either (never cached by the Steam client - e.g. never viewed in the store),
 * it's still absent from the returned map; LocalSteamLibraryLoader is what falls back to a
 * network fetch for appids this class can't resolve locally at all.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import type { SteamUserCollectionMembership } from './types/SteamMetadata'
import { TaxonomyIdResolver } from './TaxonomyIdResolver'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, type TaxonomyDataReadyEvent } from '../types/InteractionEvents'
import { Logger } from '../utils/Logger'

const LOCAL_APP_TYPE = 'game'
const NO_LOCAL_ARTWORK: AppDetailsData['artwork'] = {
    header: null,
    capsule: null,
    capsule_v5: null,
    background: null,
    background_raw: null,
}

interface LocalAppPlaytime {
    appid: number
    last_played: number | null
    playtime_minutes: number | null
}

interface LocalAppMetadata {
    appid: number
    name: string | null
    developers: string[]
    publishers: string[]
    /** Rank-ordered, most popular first - see appinfo.rs::LocalAppMetadata. */
    tags: string[]
    /** Raw numeric ids, unresolved - see appinfo.rs::LocalAppMetadata and TaxonomyIdResolver. */
    genre_ids: number[]
    category_ids: number[]
}

interface LocalUserCollection {
    id: string
    name: string
    appids: number[]
}

export class LocalSteamDataWriter {
    private static readonly logger = Logger.createLogFunctions(LocalSteamDataWriter.name)

    /**
     * Reads playtime + tag/developer/publisher/genre/category data from the local Steam install
     * and writes it into AppDetailsCache. Returns the entries actually written, keyed by appid
     * (empty on web, or if the local scan finds nothing to write) - callers that also need the
     * resolved name per appid (e.g. to build a renderable game list) can read it off the
     * returned map instead of re-invoking read_local_app_metadata themselves.
     */
    public static async writeLocalAppMetadata(): Promise<Map<number, AppDetailsData>> {
        // isTauri() here means "can this process read the local Steam install's files" - the
        // invoke() calls below only exist on desktop.
        if (!isTauri()) {
            return new Map()
        }

        const playtimes = await invoke<LocalAppPlaytime[]>('read_steam_playtimes')
        const collectionsByAppid = await LocalSteamDataWriter.readCollectionsByAppid()
        const appids = [...new Set([...playtimes.map(playtime => playtime.appid), ...collectionsByAppid.keys()])]
        if (appids.length === 0) {
            return new Map()
        }

        const metadata = await invoke<LocalAppMetadata[]>('read_local_app_metadata', { appids })

        const entries = new Map<number, AppDetailsData>()
        for (const item of metadata) {
            const collections = collectionsByAppid.get(item.appid) ?? []
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry(item, collections)
            if (entry) {
                entries.set(item.appid, entry)
            }
        }

        if (entries.size === 0) {
            return entries
        }

        // mergeMany, not setMany - this write and the baked-cache seed both start around app
        // startup with no ordering guarantee between them. Merging per-field means whichever
        // lands first is safe: neither can stomp real data the other already has (see
        // AppDetailsCache.mergeMany's doc comment).
        await AppDetailsCache.mergeMany(entries, Date.now())
        LocalSteamDataWriter.logger.info(`Wrote ${entries.size} locally-sourced AppDetailsCache entries`)

        EventManager.getInstance().emit<TaxonomyDataReadyEvent>(SteamEventTypes.TaxonomyDataReady, {
            origin: 'local-scan',
        })

        return entries
    }

    /**
     * Skips appids with no local name - appinfo.vdf has no cached info for them at all, and a
     * partial entry with a blank name would be worse than no entry (GamesLoader would treat it
     * as a real cache hit with a broken display name instead of queuing the normal network fetch).
     *
     * Always writes NO_LOCAL_ARTWORK (local-scan has no artwork source of its own) - safe to do
     * unconditionally now that writeLocalAppMetadata merges via AppDetailsCache.mergeMany rather
     * than overwriting: a null artwork field here can't beat a real URL already in the cache.
     */
    public static async buildAppDetailsEntry(
        metadata: LocalAppMetadata,
        collections: readonly SteamUserCollectionMembership[] = []
    ): Promise<AppDetailsData | null> {
        if (!metadata.name) {
            return null
        }

        const [genres, categories] = await Promise.all([
            TaxonomyIdResolver.resolveGenres(metadata.genre_ids),
            TaxonomyIdResolver.resolveCategories(metadata.category_ids),
        ])

        return {
            type: LOCAL_APP_TYPE,
            name: metadata.name,
            artwork: NO_LOCAL_ARTWORK,
            developers: metadata.developers.length > 0 ? metadata.developers : undefined,
            publishers: metadata.publishers.length > 0 ? metadata.publishers : undefined,
            steamspy_tags: LocalSteamDataWriter.buildWeightedTags(metadata.tags),
            genres: genres.length > 0 ? genres : undefined,
            categories: categories.length > 0 ? categories : undefined,
            user_collections: collections.length > 0 ? collections : undefined,
        }
    }

    /**
     * A collections-read failure (no collections file, unusual multi-account edge case in
     * active_userdata_dir()) shouldn't block writing name/tags/genres/categories - collections
     * are the least-critical field here, so this degrades to "no collections" rather than
     * failing the whole write.
     */
    private static async readCollectionsByAppid(): Promise<Map<number, SteamUserCollectionMembership[]>> {
        let collections: LocalUserCollection[] = []
        try {
            collections = await invoke<LocalUserCollection[]>('read_steam_collections')
        } catch (error) {
            LocalSteamDataWriter.logger.warn('Failed to read Steam collections, proceeding without them:', error)
        }

        const collectionsByAppid = new Map<number, SteamUserCollectionMembership[]>()
        for (const collection of collections) {
            const membership = { id: collection.id, name: collection.name }
            for (const appid of collection.appids) {
                const memberships = collectionsByAppid.get(appid)
                if (memberships) {
                    memberships.push(membership)
                } else {
                    collectionsByAppid.set(appid, [membership])
                }
            }
        }
        return collectionsByAppid
    }

    /**
     * Synthesizes a descending weight from rank position (appinfo.vdf gives rank order, not
     * vote counts) so this slots into steamspy_tags' vote-count-shaped Record<string, number>
     * unchanged - getTopSteamSpyTags just sorts by weight, so rank-derived weights reproduce
     * the same top-N ordering a real vote count would.
     */
    private static buildWeightedTags(tags: string[]): Record<string, number> | undefined {
        if (tags.length === 0) {
            return undefined
        }
        const weighted: Record<string, number> = {}
        tags.forEach((tag, index) => {
            weighted[tag] = tags.length - index
        })
        return weighted
    }
}
