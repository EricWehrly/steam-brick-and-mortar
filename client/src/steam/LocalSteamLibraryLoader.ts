/**
 * Builds a renderable library from local Steam data (identity + playtime, joined against
 * LocalSteamDataWriter's resolved names/taxonomy) and drives it through the existing
 * SteamIntegration import pipeline - SteamEventTypes.ImportLibrary -> handleImportLibrary ->
 * applyLibrary() - the same BatchEmitter-streamed, persistLibrary()-backed path bookmarklet/file
 * imports already use. See docs/plans/desktop-local-data-pipeline-plan.md tasks 7/8: this is the
 * "startup pipeline" work, deliberately reusing existing infrastructure rather than building a
 * parallel one (ImportChannel gained a 'local-scan' variant for this - see Library.ts).
 *
 * Owns triggering LocalSteamDataWriter's write - LocalSteamDataInspector (the debug tool) is
 * read-only and does not call it. No-ops entirely on the web build (isTauri() is false there).
 *
 * Self-registers on GameEventTypes.Start, imported for its side effect from SteamIntegration.ts.
 */

import { invoke, isTauri } from '@tauri-apps/api/core'
import { EventManager } from '../core/EventManager'
import { GameEventTypes, SteamEventTypes, type SteamImportLibraryEvent } from '../types/InteractionEvents'
import type { ImportedGame } from '../steam-integration/Library'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import { LocalSteamDataWriter } from './LocalSteamDataWriter'
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

export async function loadLocalSteamLibrary(): Promise<void> {
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
    if (playtimes.length === 0) {
        return
    }

    const writtenEntries = await LocalSteamDataWriter.writeLocalAppMetadata()
    const games = buildImportedGames(playtimes, writtenEntries)
    if (games.length === 0) {
        logger.debug('Local scan found playtime data but no resolvable local names - nothing to render')
        return
    }

    const displayName = identity?.persona_name?.trim() || undefined
    EventManager.getInstance().emit<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, {
        games,
        displayName,
        steamId: identity?.steamid64,
        channel: 'local-scan',
    })

    logger.info(`Local scan: emitting ImportLibrary with ${games.length} games`)
}

/**
 * Joins playtime (has numbers, no name) against LocalSteamDataWriter's written entries (has the
 * resolved name, no playtime numbers). Only appids present in both become a game - an appid with
 * playtime but no resolvable local name has nothing renderable to show.
 */
export function buildImportedGames(
    playtimes: readonly LocalAppPlaytime[],
    entries: ReadonlyMap<number, AppDetailsData>
): ImportedGame[] {
    const games: ImportedGame[] = []
    for (const playtime of playtimes) {
        const entry = entries.get(playtime.appid)
        if (!entry) {
            continue
        }
        games.push({
            appid: playtime.appid,
            name: entry.name,
            playtime_forever: playtime.playtime_minutes ?? 0,
            rtime_last_played: playtime.last_played ?? undefined,
        })
    }
    return games
}

export function initializeLocalSteamLibraryLoaderOnStart(): void {
    void loadLocalSteamLibrary()
}

EventManager.getInstance().registerEventHandler(GameEventTypes.Start, initializeLocalSteamLibraryLoaderOnStart)
