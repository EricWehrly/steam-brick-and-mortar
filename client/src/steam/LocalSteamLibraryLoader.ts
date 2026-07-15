/**
 * Builds a renderable library from local Steam data (identity + playtime + collections, joined
 * against LocalSteamDataWriter's resolved names/taxonomy) and drives it through the existing
 * SteamIntegration import pipeline - SteamEventTypes.ImportLibrary -> handleImportLibrary ->
 * applyLibrary() - the same BatchEmitter-streamed, persistLibrary()-backed path bookmarklet/file
 * imports already use. See docs/plans/desktop-local-data-pipeline-plan.md tasks 7/8: this is the
 * "startup pipeline" work, deliberately reusing existing infrastructure rather than building a
 * parallel one (ImportChannel gained a 'local-scan' variant for this - see Library.ts).
 *
 * The sole owner of triggering LocalSteamDataWriter's write. No-ops entirely on the web build
 * (isTauri() is false there).
 *
 * Candidate appids come from union(playtime, collection membership) - a game filed into a
 * collection but never launched has no playtime entry, but is still a real candidate. Local
 * resolution (appinfo.vdf, via LocalSteamDataWriter) is attempted for the whole union first;
 * whatever's still missing from AppDetailsCache after that (AppDetailsCache.findMissing) gets a
 * direct network fetch (SteamApiClient.fetchAndCacheAppDetails) as a deliberate, bounded
 * gap-fill - not the "assume the Lambda might vanish" startup path, an explicit best-effort
 * extra for appids the local install alone can't name. A fetch failure here just means those
 * appids stay unresolved this run, not a broken startup.
 *
 * Self-registers on GameEventTypes.Start, imported for its side effect from SteamIntegration.ts.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { EventManager } from '../core/EventManager'
import { GameEventTypes, SteamEventTypes, type SteamImportLibraryEvent } from '../types/InteractionEvents'
import type { ImportedGame, Library } from '../steam-integration/Library'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import { LocalSteamDataWriter } from './LocalSteamDataWriter'
import { AppDetailsCache } from './cache/AppDetailsCache'
import { SteamApiClient } from './SteamApiClient'
import { loadPersistedLibrary } from '../steam-integration/LibraryStore'
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

interface LocalUserCollection {
    id: string
    name: string
    appids: number[]
}

const logger = Logger.createLogFunctions('LocalSteamLibraryLoader')

export async function loadLocalSteamLibrary(): Promise<void> {
    // isTauri() here means "can this process read the local Steam install's files" - true for
    // the desktop app, false for the web build, where none of the invoke() calls below exist.
    if (!isTauri()) {
        return
    }

    let identity: SteamIdentity | undefined
    try {
        identity = await invoke<SteamIdentity>('read_steam_identity')
    } catch (error) {
        logger.debug('No local Steam identity found, proceeding without one:', error)
    }

    const playtimes = await invoke<LocalAppPlaytime[]>('read_steam_playtimes')
    const collectionAppids = await readCollectionAppids()
    const candidateAppids = new Set<number>([...playtimes.map(playtime => playtime.appid), ...collectionAppids])
    if (candidateAppids.size === 0) {
        return
    }

    await LocalSteamDataWriter.writeLocalAppMetadata()
    await resolveRemainingAppidsFromNetwork(candidateAppids)

    const appDetailsCache = new AppDetailsCache()
    const resolvedEntries = await appDetailsCache.getMany([...candidateAppids])
    const playtimesByAppid = new Map(playtimes.map(playtime => [playtime.appid, playtime]))
    const games = buildImportedGames(candidateAppids, playtimesByAppid, resolvedEntries)
    if (games.length === 0) {
        logger.debug('Local scan found candidate appids but none resolved to a name - nothing to render')
        return
    }

    // handleGameStart() already rendered the persisted snapshot from last launch (fast path,
    // runs before this async scan finishes). If this scan reproduces that same library, emitting
    // ImportLibrary here would tear it down and rebuild an equivalent one for no reason - see
    // docs/plans/desktop-offline-first-plan.md "Definitive root cause (sixth pass)" for the
    // second-load artwork loss this caused.
    const diff = computeLibraryDiff(games, loadPersistedLibrary())
    if (diff && diff.addedAppids.length === 0 && diff.removedGames.length === 0 && diff.renamedGames.length === 0) {
        logger.info(`Local scan: library unchanged from persisted snapshot (${games.length} games) - skipping re-render`)
        return
    }

    const displayName = identity?.persona_name?.trim() || undefined
    EventManager.getInstance().emit<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, {
        games,
        displayName,
        steamId: identity?.steamid64,
        channel: 'local-scan',
        // Only meaningful when there IS a prior local-scan library to reconcile against - see
        // computeLibraryDiff. Lets SteamIntegration keep unchanged games' GPU texture slots
        // instead of re-fetching everyone's artwork for a one-game library update.
        reconcile: diff ? { removedGameNames: [...diff.removedGames.map(g => g.name), ...diff.renamedGames.map(g => g.oldName)] } : undefined,
    })

    logger.info(`Local scan: emitting ImportLibrary with ${games.length} games`)
}

async function readCollectionAppids(): Promise<number[]> {
    try {
        const collections = await invoke<LocalUserCollection[]>('read_steam_collections')
        return collections.flatMap(collection => collection.appids)
    } catch (error) {
        logger.debug('Failed to read Steam collections, proceeding without them:', error)
        return []
    }
}

/**
 * Whatever LocalSteamDataWriter's local-only resolution couldn't cover - genuinely new to
 * AppDetailsCache from any source - gets one network fetch attempt. Best-effort: a failure here
 * (Lambda unreachable) leaves those appids absent from the final games list rather than blocking
 * the rest of the library from rendering.
 */
async function resolveRemainingAppidsFromNetwork(candidateAppids: ReadonlySet<number>): Promise<void> {
    const appDetailsCache = new AppDetailsCache()
    const missingAppids = await appDetailsCache.findMissing([...candidateAppids])
    if (missingAppids.length === 0) {
        return
    }

    try {
        const resolved = await SteamApiClient.getInstance().fetchAndCacheAppDetails(missingAppids)
        logger.info(`Resolved ${resolved.size}/${missingAppids.length} collection-only appids via network fetch`)
    } catch (error) {
        logger.warn(`Failed to network-resolve ${missingAppids.length} unseen appid(s), proceeding without them:`, error)
    }
}

export interface LibraryDiff {
    /** Present in the scan, absent from the persisted library entirely. */
    readonly addedAppids: readonly number[]
    /** Present in the persisted library, absent from the scan entirely. */
    readonly removedGames: readonly { readonly appid: number; readonly name: string }[]
    /** Same appid in both, but the name changed - functionally a remove-then-add for anything
     *  keyed by game name (the artwork texture-slot map, notably - see
     *  LodArtworkOrchestrator.reconcileForLibraryReload). */
    readonly renamedGames: readonly { readonly appid: number; readonly oldName: string; readonly newName: string }[]
}

/**
 * Diffs a fresh local scan against the persisted local-scan library (Tier A/B from
 * docs/plans/desktop-offline-first-plan.md). Deliberately ignores playtime/lastPlayed - those
 * don't change what's on the shelves, only sort order. Returns null when there's no local-scan
 * library to diff against (first-ever launch, or the persisted library came from a different
 * channel) - a null diff means "nothing to reconcile against," not "nothing changed."
 */
export function computeLibraryDiff(games: readonly ImportedGame[], persisted: Library | null): LibraryDiff | null {
    if (!persisted || persisted.provenance.channel !== 'local-scan') {
        return null
    }

    const incomingByAppid = new Map(games.map(g => [g.appid, g]))
    const persistedByAppid = new Map(persisted.games.map(g => [g.appid, g]))

    const addedAppids = games.filter(g => !persistedByAppid.has(g.appid)).map(g => g.appid)
    const removedGames = persisted.games
        .filter(g => !incomingByAppid.has(g.appid))
        .map(g => ({ appid: g.appid, name: g.name }))
    const renamedGames = games.flatMap(g => {
        const prior = persistedByAppid.get(g.appid)
        return prior && prior.name !== g.name
            ? [{ appid: g.appid, oldName: prior.name, newName: g.name }]
            : []
    })

    return { addedAppids, removedGames, renamedGames }
}

/** Convenience wrapper around computeLibraryDiff for callers that only need the yes/no answer. */
export function isEquivalentToPersisted(games: readonly ImportedGame[], persisted: Library | null): boolean {
    const diff = computeLibraryDiff(games, persisted)
    return diff !== null && diff.addedAppids.length === 0 && diff.removedGames.length === 0 && diff.renamedGames.length === 0
}

/**
 * Joins the full playtime+collection candidate set against whatever AppDetailsCache now has for
 * each appid (local or network-resolved) - an appid still missing an entry after both resolution
 * attempts has nothing renderable to show.
 */
export function buildImportedGames(
    candidateAppids: ReadonlySet<number>,
    playtimesByAppid: ReadonlyMap<number, LocalAppPlaytime>,
    entries: ReadonlyMap<number, AppDetailsData>
): ImportedGame[] {
    const games: ImportedGame[] = []
    for (const appid of candidateAppids) {
        const entry = entries.get(appid)
        if (!entry) {
            continue
        }
        const playtime = playtimesByAppid.get(appid)
        games.push({
            appid,
            name: entry.name,
            playtime_forever: playtime?.playtime_minutes ?? 0,
            rtime_last_played: playtime?.last_played ?? undefined,
        })
    }
    return games
}

export function initializeLocalSteamLibraryLoaderOnStart(): void {
    void loadLocalSteamLibrary()
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeLocalSteamLibraryLoaderOnStart)
