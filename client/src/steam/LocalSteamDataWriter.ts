/**
 * Writes locally-mined Steam data (see docs/plans/desktop-local-data-pipeline-plan.md) into the
 * same AppDetailsCache the network/Lambda path uses - the same IndexedDB store, same schema,
 * so GamesLoader's existing cache-read logic needs no changes to pick these entries up.
 *
 * No-ops entirely on the web build (isTauri() is false there).
 *
 * Known limitations, both intentional deferrals, not bugs:
 * - `is_free` is always written as false: appinfo.vdf's local price fields aren't extracted yet,
 *   and it doesn't matter for this path anyway (these are the user's own played games, not
 *   candidates for the anonymous/demo store, which is the only place is_free is read).
 * - `categories`/`genres` are left undefined: appinfo.vdf only gives numeric ids for those, and
 *   no local id->name table has been found yet (see findings doc). Because
 *   GamesLoader.isMetadataComplete only treats an entry as cache-complete when categories or
 *   genres are present, these locally-written entries still queue a network refresh - the tag/
 *   developer/publisher data is visible to anything reading AppDetailsCache directly
 *   (GamesLoader.enrichFromCache), just not enough by itself to skip the network round-trip.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
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
}

export class LocalSteamDataWriter {
    private static readonly logger = Logger.createLogFunctions(LocalSteamDataWriter.name)

    /**
     * Reads playtime + tag/developer/publisher data from the local Steam install and writes it
     * into AppDetailsCache. Returns the number of entries written (0 on web, or if the local
     * scan finds nothing to write).
     */
    public static async writeLocalAppMetadata(): Promise<number> {
        if (!isTauri()) {
            return 0
        }

        const playtimes = await invoke<LocalAppPlaytime[]>('read_steam_playtimes')
        const appids = playtimes.map(playtime => playtime.appid)
        if (appids.length === 0) {
            return 0
        }

        const metadata = await invoke<LocalAppMetadata[]>('read_local_app_metadata', { appids })
        const entries = new Map<number, AppDetailsData>()
        for (const item of metadata) {
            const entry = LocalSteamDataWriter.buildAppDetailsEntry(item)
            if (entry) {
                entries.set(item.appid, entry)
            }
        }

        if (entries.size === 0) {
            return 0
        }

        const cache = new AppDetailsCache()
        await cache.setMany(entries)
        LocalSteamDataWriter.logger.info(`Wrote ${entries.size} locally-sourced AppDetailsCache entries`)
        return entries.size
    }

    /**
     * Skips appids with no local name - appinfo.vdf has no cached info for them at all, and a
     * partial entry with a blank name would be worse than no entry (GamesLoader would treat it
     * as a real cache hit with a broken display name instead of queuing the normal network fetch).
     */
    public static buildAppDetailsEntry(metadata: LocalAppMetadata): AppDetailsData | null {
        if (!metadata.name) {
            return null
        }

        return {
            type: LOCAL_APP_TYPE,
            name: metadata.name,
            is_free: false,
            artwork: NO_LOCAL_ARTWORK,
            developers: metadata.developers.length > 0 ? metadata.developers : undefined,
            publishers: metadata.publishers.length > 0 ? metadata.publishers : undefined,
            steamspy_tags: LocalSteamDataWriter.buildWeightedTags(metadata.tags),
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
