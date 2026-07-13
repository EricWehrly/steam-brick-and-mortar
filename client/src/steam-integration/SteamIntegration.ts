/**
 * Steam Integration Manager
 *
 * High-level Steam game library integration that orchestrates:
 * - Steam API calls
 * - Progressive loading workflow
 * - Steam data transformation
 * - Cache management
 */
// TD: steam-integration-loading-strategy-split

import { SteamApiClient, type SteamGame, type SteamUser, type SteamResolveResponse } from '../steam'
import { deriveArtworkFromAppId } from '../steam/utils/ArtworkUrls'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { Library, LibraryGame } from './Library'
import { persistLibrary, loadPersistedLibrary, clearPersistedLibrary } from './LibraryStore'
import { ManualLibraryImportGateway } from './ManualLibraryImportGateway'
import { BatchEmitter } from '../steam/BatchEmitter'
import { GameLayoutConstants } from '../scene/props/shared/GameBoxUtils'
import type { SteamGameData } from '../scene'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, GameEventTypes } from '../types/InteractionEvents'
import type {
    SteamLoadLibraryEvent,
    SteamCacheClearEvent,
    SteamDataLoadedEvent,
    SteamLibraryManifestReadyEvent,
    SteamImportLibraryEvent,
} from '../types/InteractionEvents'
import type { GameDataReadyEvent } from '../types/EnvironmentEvents'
import { AppSettings } from '../core/AppSettings'
import { DataManager, DataDomain } from '../core/data'
import { sortByNumericField } from '../scene/categorization/GameSortFunctions'
import '../scene/batch/BatchCoordinator'
import { StorePropsEventTypes } from '../scene/props/PropsEvents'
import type { StorePropsLibraryReloadRequestEvent } from '../scene/props/PropsEvents'

export interface SteamUserIdentifier {
    vanityUrl: string
    displayName?: string
    steamId?: string
}

export interface LoadGamesOptions {
    maxGames?: number
}

export class SteamIntegration {
    private static readonly logger = Logger.createLogFunctions(SteamIntegration.name)
    private static _instance: SteamIntegration | null = null

    private steamClient: SteamApiClient
    private gameLibrary: GameLibraryManager
    private eventManager: EventManager
    private steamId: string

    static getInstance(): SteamIntegration {
        if (!SteamIntegration._instance) {
            SteamIntegration._instance = new SteamIntegration()
        }
        return SteamIntegration._instance
    }

    /** For testing - resets the singleton so the next getInstance() call constructs fresh. */
    static dispose(): void {
        SteamIntegration._instance = null
    }

    private constructor() {
        this.eventManager = EventManager.getInstance()
        this.steamClient = SteamApiClient.getInstance()
        this.gameLibrary = new GameLibraryManager()

        // Register event handlers directly - no workflow manager needed
        this.registerEventHandlers()

        // Self-contained: owns the bookmarklet postMessage protocol end to end and emits
        // ImportLibrary on our behalf — see ManualLibraryImportGateway's own docs for why this
        // isn't (and shouldn't be) coupled back to SteamIntegration beyond that one event.
        new ManualLibraryImportGateway()
    }

    private registerEventHandlers(): void {
        this.eventManager.registerEventHandler(SteamEventTypes.LoadLibrary, this.handleLoadLibrary.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.ImportLibrary, this.handleImportLibrary.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.handleClearCache.bind(this))
        this.eventManager.registerEventHandler(GameEventTypes.Start, this.handleGameStart.bind(this))
    }

    /**
     * Persist Steam session/library state and emit phase-specific readiness events.
     *
     * Event order:
     * 1) DataLoaded            - integration/session signal (UI/cache refresh)
     * 2) LibraryManifestReady  - immutable membership (appid list + totals)
     * 3) GameDataReady         - definitions-ready arrangement trigger
     */
    private storeSteamDataAndEmitEvent(userInput: string | null): void {
        const gameLibraryState = this.getGameLibraryState()
        const games: SteamGameData[] = gameLibraryState.userData?.games || []
        this.steamId = gameLibraryState.userData?.steamid
        const displayName = SteamIntegration.resolveDisplayName(gameLibraryState.userData?.vanity_url)

        SteamIntegration.logger.debug(`Storing ${games.length} games in DataManager`)

        const dataManager = DataManager.getInstance()
        dataManager.set<SteamGameData[]>('steam.games', games, {
            domain: DataDomain.SteamIntegration
        })
        if (userInput) {
            dataManager.set<string>('steam.userInput', userInput, {
                domain: DataDomain.SteamIntegration
            })
        }

        this.eventManager.emit<SteamDataLoadedEvent>(SteamEventTypes.DataLoaded, {
            userInput: displayName,
        })

        const totalGames = games.length
        const BATCH_SIZE = 18
        const totalBatches = Math.ceil(totalGames / BATCH_SIZE)
        this.eventManager.emit<SteamLibraryManifestReadyEvent>(SteamEventTypes.LibraryManifestReady, {
            userInput: userInput ?? undefined,
            totalGames,
        })

        this.eventManager.emit<GameDataReadyEvent>(GameEventTypes.GameDataReady, {
            totalGames,
            totalBatches,
        })
    }

    /** Returns true when no user identity has been established (anonymous/demo browse). */
    public isAnonymous(): boolean {
        return !DataManager.getInstance().get<string>('steam.userInput')
    }

    /** A real vanity name, never the internal "steamid:<id>" placeholder used when there's
     *  no vanity — that placeholder should never surface as a display name. */
    private static resolveDisplayName(vanityUrl: string | undefined): string | undefined {
        const trimmed = vanityUrl?.trim()
        return trimmed && !trimmed.toLowerCase().startsWith('steamid:') ? trimmed : undefined
    }

    private async loadGamesForUser(userInput: string, ignoreCache = false): Promise<GameLibraryState> {
        const parsedInput = ValidationUtils.parseSteamUserInput(userInput)
        
        SteamIntegration.logger.info(`Loading games for Steam user: ${parsedInput.value} (type: ${parsedInput.type}${ignoreCache ? ', ignoring cache' : ''})`);

        const { steamId, vanityUrl } = await this.getSteamIdAndVanityUrl(parsedInput, ignoreCache)

        const userGames = await this.steamClient.getUserGames(steamId, ignoreCache)
        userGames.steamid = steamId
        userGames.vanity_url = userGames.vanity_url ?? vanityUrl
        this.gameLibrary.setUserData(userGames)
        
        await this.steamClient.loadGamesProgressively(userGames, {
            maxGames: AppSettings.get('maxGames'),
            sortFn: sortByNumericField('rtime_last_played', 'playtime_forever'),
        })
        
        SteamIntegration.logger.debug(`Progressive loading complete for ${userGames.game_count} games`)

        return this.gameLibrary.getState()
    }

    private async getSteamIdAndVanityUrl(parsedInput: { type: "steamid" | "customurl"; value: string }, ignoreCache: boolean): Promise<{ steamId: string; vanityUrl: string }> {
        let steamId: string
        let vanityUrl: string
        if (parsedInput.type === 'steamid') {
            // Direct steamID - no resolution needed
            steamId = parsedInput.value
            vanityUrl = `steamid:${steamId}` // Use a placeholder since we don't know the actual custom URL
        } else {
            // Custom URL - resolve to get steamID
            const resolveResponse = await this.steamClient.resolveVanityUrl(parsedInput.value, ignoreCache)
            steamId = resolveResponse.steamid
            vanityUrl = resolveResponse.vanity_url
        }

        // Validate we have a steamID before proceeding
        return { steamId, vanityUrl }
    }

    private getGameLibraryState(): GameLibraryState {
        return this.gameLibrary.getState()
    }

    /**
     * Check if cached data is available for a user
     *
     * TODO: Story 5.5.1 (backlogged) - Potential optimization to reduce from 2 cache lookups to 1,
     * but previous implementation created data duplication issues. Consider alternative approaches like
     * single-pass cache check or result memoization if this becomes a performance bottleneck.
     * See docs/active/tech-debt.md for detailed analysis.
     */
    hasCachedData(userInput: string): boolean {
        const parsedInput = ValidationUtils.parseSteamUserInput(userInput)

        if (parsedInput.type === 'steamid') {
            // Direct steamID - check games cache directly
            const gamesKey = `games_${parsedInput.value}`
            return this.steamClient.hasCached(gamesKey)
        } else {
            // Custom URL - check if we have cached resolve data first
            const resolveKey = `resolve_${parsedInput.value.toLowerCase()}`
            const cachedResolve = this.steamClient.getCached<SteamResolveResponse>(resolveKey)

            if (!cachedResolve) {
                return false
            }

            // Check if we have cached games data for the resolved Steam ID
            const gamesKey = `games_${cachedResolve.steamid}`
            return this.steamClient.hasCached(gamesKey)
        }
    }

    private async handleGameStart(): Promise<void> {
        const library = loadPersistedLibrary()

        if (library) {
            SteamIntegration.logger.info(
                `Auto-load: persisted library (${library.provenance.channel}, ${library.games.length} games)`
            )
            await this.applyLibrary(library)
            return
        }

        SteamIntegration.logger.info('No persisted library - loading anonymous store')
        await this.loadDemoGames()
    }

    /**
     * Load the anonymous store from whatever the release's baked appdetails cache actually
     * contains (is_free === true, undesirable_for_demo unset - see
     * GamesLoader.getDemoGames()) - no hand-maintained game list, no network calls, no
     * separate runtime check for artwork quality. Awaits the baked-cache seed so a cold cache
     * still gets the full set. See docs/plans/f2p-artwork-bake-plan.md.
     */
    private async loadDemoGames(): Promise<void> {
        try {
            const games = await this.steamClient.getDemoGames()

            const demoUser: SteamUser = {
                steamid: '',
                vanity_url: '',
                game_count: games.length,
                retrieved_at: new Date().toISOString(),
                games
            }

            // Register games in gameLibrary so they're available for storeSteamDataAndEmitEvent().
            // vanity_url/steamid are empty strings (not undefined) so the UI can access them
            // without crashes, but isAnonymous() returns true because steam.userInput is not set.
            this.gameLibrary.setUserData(demoUser)

            this.storeSteamDataAndEmitEvent(null)
            await this.emitGamesInBatches(games)

            SteamIntegration.logger.info(`Demo store loaded: ${games.length} games`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load demo games:', error)
        }
    }

    /**
     * Load a library captured offline (manual export bookmarklet, or a previously-saved
     * export file) — no Steam API network calls, artwork derived from appid, name from the
     * capture itself (AppDetailsCache can still upgrade it — see applyLibrary).
     */
    private async handleImportLibrary(event: CustomEvent<SteamImportLibraryEvent>): Promise<void> {
        const { games, displayName, steamId, channel } = event.detail

        if (!games.length) {
            SteamIntegration.logger.warn('ImportLibrary had no games, ignoring')
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

        if (await this.applyLibrary(library)) {
            persistLibrary(library)
            SteamIntegration.logger.info(`Imported library loaded: ${library.games.length} games (${channel})`)
        }
    }

    /**
     * Renders a Library immediately from whatever's already known — ownership fields plus a
     * read-only AppDetailsCache join, no network fetch. The single render path for both a
     * freshly-captured import and a persisted Library restored on startup, regardless of
     * channel (Library's whole point — see docs/plans/library-source-convergence-plan.md).
     *
     * Fork A: if the library has a steamId, a background re-fetch is kicked off (gated by
     * autoLoadProfile) to replace this snapshot with live data once it lands — re-fetchability
     * is a property of having a steamId, not of the channel.
     *
     * Returns whether the render succeeded, so callers only persist a library they could
     * actually show.
     */
    private async applyLibrary(library: Library): Promise<boolean> {
        try {
            if (this.gameLibrary.getState().userData?.games?.length) {
                this.eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
                SteamIntegration.logger.info('Emitted LibraryReloadRequest before library load')
            }

            const ownedGames: SteamGame[] = library.games.map((g): SteamGame => ({
                appid: g.appid,
                name: g.name,
                playtime_forever: g.playtimeForever,
                rtime_last_played: g.lastPlayed,
                img_icon_url: '',
                img_logo_url: '',
                artwork: deriveArtworkFromAppId(g.appid),
                playtime_disconnected: g.playtimeDisconnected
            }))
            const enrichedGames = await this.steamClient.enrichFromCache(ownedGames)

            // No real display name (e.g. a bare /profiles/<steamid>/ with no vanity set) is
            // treated the same as the anonymous demo store — falls through to the sign's
            // existing generic "STEAM LIBRARY" title rather than showing a placeholder.
            const user: SteamUser = {
                steamid: library.owner.steamId ?? '',
                vanity_url: library.owner.displayName ?? '',
                game_count: enrichedGames.length,
                retrieved_at: library.provenance.capturedAt,
                games: enrichedGames
            }

            this.gameLibrary.setUserData(user)
            this.storeSteamDataAndEmitEvent(library.owner.displayName ?? 'imported-library')
            await this.emitGamesInBatches(enrichedGames)

            if (library.owner.steamId && AppSettings.get('autoLoadProfile')) {
                SteamIntegration.logger.info(`Background re-fetch for steamId ${library.owner.steamId}`)
                this.eventManager.emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, {
                    userInput: library.owner.steamId
                })
            }

            return true
        } catch (error) {
            SteamIntegration.logger.error('Failed to apply library:', error)
            // Nothing loaded yet (a startup auto-load, not a user retrying over an existing
            // session) — fall back to the demo store so DataLoaded still fires and the Steam
            // UI panel becomes visible instead of staying hidden with no recovery path.
            if (this.isAnonymous()) {
                await this.loadDemoGames()
            }
            return false
        }
    }

    /**
     * Emits games as GamesBatchReady events in shelf-sized batches, yielding between each.
     * Shares BatchEmitter with GamesLoader's network-progressive path — see BatchEmitter's
     * own docs for why the batching contract is identical even though these games (demo
     * store / imported libraries) are already fully known in memory, unlike a network
     * fetch. Games are cloned per-batch defensively, since callers may reuse the source array.
     */
    private async emitGamesInBatches(games: SteamGame[]): Promise<void> {
        const BATCH_SIZE = GameLayoutConstants.GAMES_PER_SURFACE * GameLayoutConstants.SURFACES_PER_SHELF
        const totalBatches = Math.ceil(games.length / BATCH_SIZE)
        const emitter = new BatchEmitter(BATCH_SIZE, totalBatches)

        for (const game of games) {
            await emitter.push({ ...game })
        }
        await emitter.flush()
    }

    private async handleLoadLibrary(event: CustomEvent<SteamLoadLibraryEvent>): Promise<void> {
        // TD: caching-staleness-heuristic
        // 1. Determine if we should force an update based on staleness of cached data
        // 2. Or, if this is a manual "Refresh Cache Now" request from the UI panel (to be built)
        // 3. Determine the userInput (either passed from event, or use this.steamId if reloading)

        // TD: background-refresh-and-update
        // After we load the cached data, we need a mechanism to fetch updated game data 
        // in the background and gracefully inject any new games into the scene.

        const { userInput, forceUpdate } = event.detail
        const targetInput = userInput || this.steamId

        if (!targetInput) {
            SteamIntegration.logger.warn('No user input or current user provided, cannot load library')
            return
        }

        try {
            // If a store is already loaded, clear it before the new user's data arrives.
            if (this.gameLibrary.getState().userData?.games?.length) {
                this.eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
                SteamIntegration.logger.info('Emitted LibraryReloadRequest before library load')
            }

            await this.loadGamesForUser(targetInput, forceUpdate)
            this.storeSteamDataAndEmitEvent(targetInput)

            // Snapshot for a fast render on the next reload (applyLibrary) — Fork A's
            // background re-fetch (gated on this same steamId + autoLoadProfile) is what keeps
            // it fresh from there, so this doesn't need to be re-persisted more eagerly.
            const userData = this.gameLibrary.getState().userData
            if (userData?.steamid) {
                persistLibrary({
                    owner: {
                        steamId: userData.steamid,
                        displayName: SteamIntegration.resolveDisplayName(userData.vanity_url)
                    },
                    games: userData.games.map((g): LibraryGame => ({
                        appid: g.appid,
                        name: g.name,
                        playtimeForever: g.playtime_forever,
                        lastPlayed: g.rtime_last_played
                    })),
                    provenance: { channel: 'online', capturedAt: new Date().toISOString() }
                })
            }

            SteamIntegration.logger.info(forceUpdate ? 'Library load (forced update) completed' : 'Library load completed')
        } catch (error) {
            SteamIntegration.logger.error('Library load failed:', error)
            // Nothing loaded yet (a startup auto-load, not a user retrying over an existing
            // session) — fall back to the demo store so DataLoaded still fires and the Steam
            // UI panel becomes visible instead of staying hidden with no recovery path.
            if (this.isAnonymous()) {
                await this.loadDemoGames()
            }
        }
    }

    /**
     * SteamApiClient independently reacts to the same CacheClear event for its own cache
     * domains (see SteamApiClient.handleCacheClear) — this handler only owns what
     * SteamIntegration itself holds: the active library/session state. 'all' additionally
     * drops the in-memory game library; 'identity' ("Clear cached profile & reload") leaves
     * it in place since a reload always follows immediately, but clears the persisted
     * pointer either way so a startup re-check can't resurrect the old session.
     */
    private handleClearCache(event: CustomEvent<SteamCacheClearEvent>): void {
        if (event.detail.scope === 'all') {
            this.gameLibrary.clear()
        }
        clearPersistedLibrary()
        DataManager.getInstance().delete('steam.userInput')
    }
}
