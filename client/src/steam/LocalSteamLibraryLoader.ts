/**
 * Builds a renderable Library from local Steam data (identity + playtime + collections, joined
 * against LocalSteamDataWriter's resolved names/taxonomy). Returns it directly rather than
 * emitting an event - called as one deliberate branch of SteamIntegration's startup waterfall
 * (cache -> local disk -> online -> demo, exactly one branch taken - see handleGameStart), not a
 * parallel/independent trigger. See docs/plans/desktop-local-data-pipeline-plan.md tasks 7/8.
 *
 * The sole owner of triggering LocalSteamDataWriter's write. No-ops entirely on the web build
 * (isTauri() is false there).
 *
 * Candidate appids come from union(playtime, collection membership) - a game filed into a
 * collection but never launched has no playtime entry, but is still a real candidate. Local
 * resolution (appinfo.vdf, via LocalSteamDataWriter) is attempted for the whole union first;
 * whatever's still missing from AppDetailsCache after that (AppDetailsCache.findMissing) gets a
 * direct network fetch (SteamApiClient.gamesLoader.fetchAndCacheAppDetails) as a deliberate, bounded
 * gap-fill - not the "assume the Lambda might vanish" startup path, an explicit best-effort
 * extra for appids the local install alone can't name. A fetch failure here just means those
 * appids stay unresolved this run, not a broken startup.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Library, LibraryGame } from '../steam-integration/Library'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import { LocalSteamDataWriter } from './LocalSteamDataWriter'
import { AppDetailsCache } from './cache/AppDetailsCache'
import { SteamApiClient } from './SteamApiClient'
import { LocalLibraryArtReader } from './LocalLibraryArtReader'
import { GameArtworkProvider } from '../scene/game-box/instancing/GameArtworkProvider'
import { Logger } from '../utils/Logger'

interface SteamIdentity {
    steamid64: string
    account_name: string
    persona_name: string
    most_recent: boolean
}

interface LocalAppPlaytime {
    appid: number
    last_played: number | null
    playtime_minutes: number | null
}

const logger = Logger.createLogFunctions('LocalSteamLibraryLoader')

export interface LocalScanResult {
    readonly library: Library | null
    /**
     * Present even when `library` is null - e.g. a valid local identity read but zero locally
     * resolvable games (a sparse/new install). Lets the caller fall through to an online fetch
     * using this same identity instead of going straight to the demo store.
     */
    readonly steamId?: string
}

/** library is null when this isn't the desktop app, or when nothing local resolved to a renderable game. */
export async function loadLocalSteamLibrary(): Promise<LocalScanResult> {
    // isTauri() here means "can this process read the local Steam install's files" - true for
    // the desktop app, false for the web build, where none of the invoke() calls below exist.
    if (!isTauri()) {
        return { library: null }
    }

    let identity: SteamIdentity | undefined
    try {
        identity = await invoke<SteamIdentity>('read_steam_identity')
    } catch (error) {
        logger.debug('No local Steam identity found, proceeding without one:', error)
    }

    const playtimes = await invoke<LocalAppPlaytime[]>('read_steam_playtimes')
    const collectionsByAppid = await LocalSteamDataWriter.readCollectionsByAppid()
    const candidateAppids = new Set<number>([...playtimes.map(playtime => playtime.appid), ...collectionsByAppid.keys()])
    if (candidateAppids.size === 0) {
        return { library: null, steamId: identity?.steamid64 }
    }

    await LocalSteamDataWriter.writeLocalAppMetadata()
    await resolveRemainingAppidsFromNetwork(candidateAppids)
    // Covers collection members writeLocalAppMetadata's own pass can't - see its docs.
    await LocalSteamDataWriter.mergeCollectionsForAppids(candidateAppids, collectionsByAppid)

    const resolvedEntries = await AppDetailsCache.getMany([...candidateAppids])
    const playtimesByAppid = new Map(playtimes.map(playtime => [playtime.appid, playtime]))
    const games = buildLibraryGames(candidateAppids, playtimesByAppid, resolvedEntries)
    if (games.length === 0) {
        logger.debug('Local scan found candidate appids but none resolved to a name - nothing to render')
        return { library: null, steamId: identity?.steamid64 }
    }

    return {
        library: {
            owner: { steamId: identity?.steamid64, displayName: identity?.persona_name?.trim() || undefined },
            games,
            provenance: { channel: 'local-scan', capturedAt: new Date().toISOString() },
        },
    }
}

/**
 * Scans Steam's own local librarycache once for the whole candidate set and registers whatever it
 * finds directly on GameArtworkProvider's singleton - see docs/plans/startup-artwork-resolution-plan.md,
 * Root Cause D. Called from SteamIntegration.applyLibrary(), not from loadLocalSteamLibrary() above
 * - the startup waterfall's far more common case is a persisted-library cache hit, which returns
 * before loadLocalSteamLibrary() ever runs, and this needs to fire for every source (cache,
 * local-scan, online), not just the one-time local-scan branch, or the index stays empty on every
 * subsequent launch. Exported for that reason; not just an internal step of this file's own function.
 *
 * A direct call, not an event: GameArtworkProvider is accessed via getInstance() everywhere else
 * in this codebase (never event-driven), and getInstance() is idempotent/lazy, so there's no
 * ordering hazard to solve regardless of whether the provider singleton already exists yet -
 * unlike a plain EventManager.emit(), which has no late-subscriber replay (see the TODO in
 * EventManager.ts) and would silently drop this if the provider hadn't been constructed yet.
 * Best-effort: a scan failure just means this session gets no local-disk art, same as before this
 * existed.
 */
export async function registerLocalLibraryArt(candidateAppids: ReadonlySet<number>): Promise<void> {
    try {
        const entries = await LocalLibraryArtReader.findLocalArt([...candidateAppids])
        GameArtworkProvider.getInstance().registerLocalArtIndex(entries)
        if (entries.length > 0) {
            logger.info(`Local librarycache scan: ${entries.length}/${candidateAppids.size} appid(s) have cached art on disk`)
        }
    } catch (error) {
        logger.warn('Failed to scan local librarycache, proceeding without it:', error)
    }
}

/**
 * Whatever hasn't been checked against the network yet - either genuinely new to AppDetailsCache,
 * or only ever written by LocalSteamDataWriter's local-only appinfo.vdf pass (which always writes
 * null artwork, never a real header_image/capsule_image) - gets one network fetch attempt.
 * Best-effort: a failure here (Lambda unreachable) leaves those appids without real artwork this
 * run rather than blocking the rest of the library from rendering. Uses findMissingArtwork, not
 * findMissing - see its doc comment for why "has any entry" isn't the right gate here (Root Cause
 * A, docs/plans/startup-artwork-resolution-plan.md).
 */
async function resolveRemainingAppidsFromNetwork(candidateAppids: ReadonlySet<number>): Promise<void> {
    const missingAppids = await AppDetailsCache.findMissingArtwork([...candidateAppids])
    if (missingAppids.length === 0) {
        return
    }

    try {
        const resolved = await SteamApiClient.getInstance().gamesLoader.fetchAndCacheAppDetails(missingAppids)
        logger.info(`Resolved ${resolved.size}/${missingAppids.length} appid(s) needing real artwork via network fetch`)
    } catch (error) {
        logger.warn(`Failed to network-resolve ${missingAppids.length} appid(s) needing real artwork, proceeding without them:`, error)
    }
}

/**
 * Joins the full playtime+collection candidate set against whatever AppDetailsCache now has for
 * each appid (local or network-resolved) - an appid still missing an entry after both resolution
 * attempts has nothing renderable to show.
 */
export function buildLibraryGames(
    candidateAppids: ReadonlySet<number>,
    playtimesByAppid: ReadonlyMap<number, LocalAppPlaytime>,
    entries: ReadonlyMap<number, AppDetailsData>
): LibraryGame[] {
    const games: LibraryGame[] = []
    for (const appid of candidateAppids) {
        const entry = entries.get(appid)
        if (!entry) {
            continue
        }
        const playtime = playtimesByAppid.get(appid)
        games.push({
            appid,
            name: entry.name,
            playtimeForever: playtime?.playtime_minutes ?? 0,
            lastPlayed: playtime?.last_played ?? undefined,
        })
    }
    return games
}
