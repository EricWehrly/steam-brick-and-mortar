/**
 * Receives a manually-captured Steam library from the export bookmarklet via postMessage and
 * translates it into an ImportLibrary event. SteamIntegration remains the sole owner of what
 * happens to that data (see SteamIntegration.handleImportLibrary) — this class knows nothing
 * about library state; it only knows the wire protocol. See export-library.js for the matching
 * client-side half of this handshake.
 *
 * Split out from SteamIntegration because this protocol has zero dependency on gameLibrary or
 * any other library-loading state — a pure "translate external signal into an internal event"
 * gateway, self-contained enough to construct once and forget about.
 */
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamImportLibraryEvent } from '../types/InteractionEvents'
import { validateLibraryExportPayload } from './Library'
import { Logger } from '../utils/Logger'

export class ManualLibraryImportGateway {
    private static readonly logger = Logger.createLogFunctions(ManualLibraryImportGateway.name)

    private static readonly IMPORT_MESSAGE_TYPE = 'sbam-library-export'
    private static readonly IMPORT_READY_MESSAGE_TYPE = 'sbam-ready'
    private static readonly STEAM_ORIGIN = 'https://steamcommunity.com'
    /** Lets the bookmarklet find this tab by name if it needs to actively open/focus us (the
     *  "no window.opener" path — see export-library.js). */
    private static readonly APP_WINDOW_NAME = 'sbam-app'

    private eventManager: EventManager

    constructor() {
        this.eventManager = EventManager.getInstance()
        window.name = ManualLibraryImportGateway.APP_WINDOW_NAME
        window.addEventListener('message', this.handleWindowMessage.bind(this))
        this.announceReadyIfOpenedByExport()
    }

    /**
     * If this tab was opened by the export bookmarklet (rather than the reverse — this app
     * opening Steam), announce readiness so it knows it's safe to postMessage the captured
     * library instead of falling back to a file download. Harmless no-op otherwise.
     */
    private announceReadyIfOpenedByExport(): void {
        if (!window.opener || window.opener.closed) return
        window.opener.postMessage({ type: ManualLibraryImportGateway.IMPORT_READY_MESSAGE_TYPE }, '*')
    }

    /** Receives the bookmarklet's captured library via postMessage — gated to Steam's origin
     *  and the expected message shape before validation even runs. */
    private handleWindowMessage(event: MessageEvent): void {
        if (event.origin !== ManualLibraryImportGateway.STEAM_ORIGIN) return
        if (event.data?.type !== ManualLibraryImportGateway.IMPORT_MESSAGE_TYPE) return

        const validated = validateLibraryExportPayload(event.data.payload)
        if (!validated) {
            ManualLibraryImportGateway.logger.warn('Received a Steam export message, but the payload looked malformed')
            return
        }

        this.eventManager.emit<SteamImportLibraryEvent>(SteamEventTypes.ImportLibrary, {
            games: validated.games,
            displayName: validated.displayName ?? undefined,
            steamId: validated.steamId ?? undefined,
            channel: 'bookmarklet'
        })
    }
}
