/**
 * Writes locally-mined Steam data (see docs/plans/desktop-local-data-pipeline-plan.md) into the
 * same AppDetailsCache the network/Lambda path uses - the same IndexedDB store, same schema,
 * so GamesLoader's existing cache-read logic needs no changes to pick these entries up.
 *
 * No-ops entirely on the web build (isTauri() is false there).
 *
 * Known limitation, an intentional deferral, not a bug:
 * - `is_free` is always written as false: appinfo.vdf's local price fields aren't extracted yet,
 *   and it doesn't matter for this path anyway (these are the user's own played games, not
 *   candidates for the anonymous/demo store, which is the only place is_free is read).
 *
 * `categories`/`genres` are resolved via `TaxonomyIdResolver` from the pre-baked appdetails
 * bundle rather than a network call - see docs/plans/taxonomy-data-event-plan.md. An appid whose
 * local genre/category ids aren't covered by that bundle still writes with tags/name/developer/
 * publisher only, same as before this resolution existed - see
 * docs/tech-debt.md#id-metadata-refetch-no-circuit-breaker for the known (low-priority) gap that
 * leaves.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
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
        if (!isTauri()) {
            return new Map()
        }

        const playtimes = await invoke<LocalAppPlaytime[]>('read_steam_playtimes')
        const appids = playtimes.map(playtime => playtime.appid)
        if (appids.length === 0) {
            return new Map()
        }

        const metadata = await invoke<LocalAppMetadata[]>('read_local_app_metadata', { appids })
        const entries = new Map<number, AppDetailsData>()
        for (const item of metadata) {
            const entry = await LocalSteamDataWriter.buildAppDetailsEntry(item)
            if (entry) {
                entries.set(item.appid, entry)
            }
        }

        if (entries.size === 0) {
            return entries
        }

        const cache = new AppDetailsCache()
        await cache.setMany(entries)
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
     */
    public static async buildAppDetailsEntry(metadata: LocalAppMetadata): Promise<AppDetailsData | null> {
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
            is_free: false,
            artwork: NO_LOCAL_ARTWORK,
            developers: metadata.developers.length > 0 ? metadata.developers : undefined,
            publishers: metadata.publishers.length > 0 ? metadata.publishers : undefined,
            steamspy_tags: LocalSteamDataWriter.buildWeightedTags(metadata.tags),
            genres: genres.length > 0 ? genres : undefined,
            categories: categories.length > 0 ? categories : undefined,
        }
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
