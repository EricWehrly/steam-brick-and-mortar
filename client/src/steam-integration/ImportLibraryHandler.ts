/**
 * The manual-import loading strategy (bookmarklet/file export). Extracted from SteamIntegration
 * per docs/tech-debt.md#id-steam-integration-loading-strategy-split. Thin by design - the actual
 * rendering work is SteamIntegration.applyLibrary, shared with the startup waterfall's
 * cache-restore and local-scan branches, so it stays owned by SteamIntegration rather than
 * belonging to any one strategy; this module's own job is just turning the untrusted event
 * payload into a Library and persisting a successful render.
 *
 * A plain function, not a class - nothing here holds state across calls. Distinct from
 * ManualLibraryImportGateway, which owns the bookmarklet's postMessage wire protocol and is one
 * of two independent producers of the ImportLibrary event this handles (SteamUIPanel's
 * file-picker action is the other) - real event fan-in, not a disguised direct call.
 */

import type { SteamImportLibraryEvent } from '../types/InteractionEvents'
import type { Library, LibraryGame } from './Library'
import { persistLibrary } from './LibraryStore'
import { Logger } from '../utils/Logger'

const logger = Logger.createLogFunctions('ImportLibraryHandler')

export interface ImportLibraryHandlerDeps {
    /** SteamIntegration.applyLibrary - the shared render step this strategy renders through. */
    readonly applyLibrary: (library: Library) => Promise<boolean>
}

/**
 * Load a library captured offline (manual export bookmarklet, or a previously-saved
 * export file) — no Steam API network calls, artwork derived from appid, name from the
 * capture itself (AppDetailsCache can still upgrade it — see SteamIntegration.applyLibrary).
 */
export async function handleImportLibrary(event: CustomEvent<SteamImportLibraryEvent>, deps: ImportLibraryHandlerDeps): Promise<void> {
    const { games, displayName, steamId, channel } = event.detail

    if (!games.length) {
        logger.warn('ImportLibrary had no games, ignoring')
        return
    }

    const library: Library = {
        owner: { steamId, displayName },
        games: games.map((g): LibraryGame => ({
            appid: g.appid,
            name: g.name,
            playtimeForever: g.playtime_forever,
            lastPlayed: g.rtime_last_played,
            playtimeDisconnected: g.playtime_disconnected
        })),
        provenance: { channel, capturedAt: new Date().toISOString() }
    }

    if (await deps.applyLibrary(library)) {
        persistLibrary(library)
        logger.info(`Imported library loaded: ${library.games.length} games (${channel})`)
    }
}
