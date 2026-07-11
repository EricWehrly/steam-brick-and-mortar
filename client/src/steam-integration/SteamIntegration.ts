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
import { ANONYMOUS_STORE_USER } from '../steam/fixtures/demo-games'
import { deriveArtworkFromAppId } from '../steam/utils/ArtworkUrls'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { ImportedGame, ImportChannel } from './LibrarySource'
import { persistLibrarySource, loadPersistedLibrarySource, clearPersistedLibrarySource } from './LibrarySourceStore'
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
        const vanityUrl = gameLibraryState.userData?.vanity_url?.trim()
        const displayName = vanityUrl && !vanityUrl.toLowerCase().startsWith('steamid:')
            ? vanityUrl
            : undefined

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
        const source = loadPersistedLibrarySource()

        if (source?.type === 'imported') {
            SteamIntegration.logger.info(`Auto-load: imported library (${source.channel}, ${source.games.length} games)`)
            await this.applyImportedLibrary(source.games, source.displayName, source.steamId, source.channel)
            return
        }

        if (source?.type === 'online' && AppSettings.get('autoLoadProfile')) {
            SteamIntegration.logger.info(`Auto-load: ${source.userInput} (persisted library source)`)
            this.eventManager.emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, {
                userInput: source.userInput
            })
            return
        }

        // Migration bridge: a cached online profile from before LibrarySource existed (or one
        // whose LibrarySource write raced with an older client build) still auto-loads via the
        // legacy cache scan. handleLoadLibrary() persists a LibrarySource on success, so this
        // profile converges onto the source-of-truth path from its next reload on.
        const cachedUsers = this.steamClient.getCachedUsers()

        if (cachedUsers.length > 0 && AppSettings.get('autoLoadProfile')) {
            const user = cachedUsers[0]
            SteamIntegration.logger.info(`Auto-load: ${user.displayName} (${user.vanityUrl}, legacy cache scan)`)

            this.eventManager.emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, {
                userInput: user.vanityUrl
            })
            return
        }

        // Fallback to the demo/anonymous store whenever we're not auto-loading a real
        // profile - covers both the true first-run case and auto-load being toggled off.
        // Without this, a cached profile + disabled auto-load left the scene permanently
        // empty (no shelves, no boxes) until the user manually submitted a profile.
        SteamIntegration.logger.info(
            cachedUsers.length === 0 && !source
                ? 'No cached user - loading anonymous store'
                : 'Auto-load disabled - loading anonymous store'
        )
        await this.loadDemoGames()
    }

    /**
     * Load hardcoded demo games for dev/test environments.
     * Emits games directly into the batch pipeline - no network calls.
     */
    private async loadDemoGames(): Promise<void> {
        try {
            const demoUser = ANONYMOUS_STORE_USER
            const games = demoUser.games as SteamGame[]

            // Register games in gameLibrary so they're available for storeSteamDataAndEmitEvent().
            // We set vanity_url and steamid to empty strings (not undefined) so the UI can access
            // them without crashes, but isAnonymous() returns true because steam.userInput is not set.
            this.gameLibrary.setUserData({ ...demoUser, vanity_url: '', steamid: '' })

            this.storeSteamDataAndEmitEvent(null)
            await this.emitGamesInBatches(games)

            SteamIntegration.logger.info(`Demo store loaded: ${games.length} games`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load demo games:', error)
        }
    }

    /**
     * Load a library captured offline (manual export bookmarklet, or a previously-saved
     * export file) — no Steam API network calls, artwork derived from appid.
     */
    private async handleImportLibrary(event: CustomEvent<SteamImportLibraryEvent>): Promise<void> {
        await this.applyImportedLibrary(event.detail.games, event.detail.displayName, event.detail.steamId, event.detail.channel)
    }

    /**
     * Shared by the live import event handler and the startup auto-load path — persisted
     * imported libraries survive reload the same way an online cached profile does, via the
     * same LibrarySource record (see persistLibrarySource/loadPersistedLibrarySource below).
     */
    private async applyImportedLibrary(
        games: readonly ImportedGame[],
        displayName: string | undefined,
        steamId: string | undefined,
        channel: ImportChannel
    ): Promise<void> {
        if (!games.length) {
            SteamIntegration.logger.warn('ImportLibrary had no games, ignoring')
            return
        }

        try {
            if (this.gameLibrary.getState().userData?.games?.length) {
                this.eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {})
                SteamIntegration.logger.info('Emitted LibraryReloadRequest before imported library load')
            }

            // No real display name (e.g. a bare /profiles/<steamid>/ with no vanity set) is
            // treated the same as the anonymous demo store — falls through to the sign's
            // existing generic "STEAM LIBRARY" title rather than showing a placeholder.
            const ownedGames: SteamGame[] = games.map((g): SteamGame => ({
                appid: g.appid,
                name: g.name,
                playtime_forever: g.playtime_forever,
                img_icon_url: '',
                img_logo_url: '',
                artwork: deriveArtworkFromAppId(g.appid)
            }))
            // Read-only join against AppDetailsCache — gains categories/genres/canonical name
            // whenever the shared entity cache already has them (baked bundle or a prior online
            // session), without triggering a network fetch for the ones it doesn't. See
            // GamesLoader.enrichFromCache for why this stays network-free.
            const enrichedGames = await this.steamClient.enrichFromCache(ownedGames)

            const importedUser: SteamUser = {
                steamid: steamId ?? '',
                vanity_url: displayName ?? '',
                game_count: enrichedGames.length,
                retrieved_at: new Date().toISOString(),
                games: enrichedGames
            }

            // Marker only — never rendered. The sign title is driven separately by
            // importedUser.vanity_url above; this just keeps isAnonymous() correctly false
            // for any successful import, named or not (it's real user data either way).
            this.gameLibrary.setUserData(importedUser)
            this.storeSteamDataAndEmitEvent(displayName ?? 'imported-library')
            await this.emitGamesInBatches(importedUser.games)
            persistLibrarySource({
                type: 'imported',
                channel,
                importedAt: new Date().toISOString(),
                displayName,
                steamId,
                games
            })

            SteamIntegration.logger.info(`Imported library loaded: ${importedUser.games.length} games (${channel})`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load imported library:', error)
            // Nothing loaded yet (a startup auto-load, not a user retrying over an existing
            // session) — fall back to the demo store so DataLoaded still fires and the Steam
            // UI panel becomes visible instead of staying hidden with no recovery path.
            if (this.isAnonymous()) {
                await this.loadDemoGames()
            }
        }
    }

    /** Whatever string round-trips through LoadLibrary correctly on a future reload — see
     *  LibrarySource's userInput field docs for why this isn't just vanity_url directly. */
    private resolveReloadableUserInput(): string | null {
        const userData = this.gameLibrary.getState().userData
        if (!userData) return null
        const vanity = userData.vanity_url?.trim()
        if (vanity && !vanity.toLowerCase().startsWith('steamid:')) return vanity
        return userData.steamid || null
    }

    /**
     * Emits games as GamesBatchReady events in shelf-sized batches, yielding between each.
     * Shares BatchEmitter with GamesLoader's network-progressive path — see BatchEmitter's
     * own docs for why the batching contract is identical even though these games (demo
     * fixtures / imported libraries) are already fully known in memory, unlike a network
     * fetch. Games are cloned per-batch since the demo fixture (ANONYMOUS_STORE_USER) is a
     * shared module-level object reused across every anonymous-store load.
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

            const reloadableInput = this.resolveReloadableUserInput()
            if (reloadableInput) {
                persistLibrarySource({ type: 'online', userInput: reloadableInput })
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
        clearPersistedLibrarySource()
        DataManager.getInstance().delete('steam.userInput')
    }
}
