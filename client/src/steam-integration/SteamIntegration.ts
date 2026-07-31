/**
 * Steam Integration Manager
 *
 * High-level Steam game library integration that orchestrates:
 * - Steam API calls
 * - Progressive loading workflow
 * - Steam data transformation
 * - Cache management
 */

import { SteamApiClient, type SteamGame, type SteamUser, type SteamResolveResponse } from '../steam'
import { deriveArtworkFromAppId } from '../steam/utils/ArtworkUrls'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { Library } from './Library'
import { computeLibraryDiff } from './Library'
import { persistLibrary, loadPersistedLibrary, clearPersistedLibrary } from './LibraryStore'
import { ManualLibraryImportGateway } from './ManualLibraryImportGateway'
import { loadOnlineLibrary, resolveDisplayName, type OnlineLibraryLoaderDeps } from './OnlineLibraryLoader'
import { loadDemoLibrary } from './DemoLibraryLoader'
import { handleImportLibrary } from './ImportLibraryHandler'
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
import { DataManager, DataDomain } from '../core/data'
import '../scene/batch/BatchCoordinator'
import { loadLocalSteamLibrary, registerLocalLibraryArt } from '../steam/LocalSteamLibraryLoader'
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
        const displayName = resolveDisplayName(gameLibraryState.userData?.vanity_url)

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

    /**
     * Startup waterfall - exactly one source is chosen, no other source runs alongside it.
     * Priority order: cache (any channel's persisted Library) -> local disk (desktop only) ->
     * online fetch (only reachable if local disk resolved an identity but no games) -> demo.
     * A deliberate, explicitly-delayed background network-freshness pass is separate, future
     * work - not an automatic follow-up to whichever of these renders.
     */
    private async handleGameStart(): Promise<void> {
        const cached = loadPersistedLibrary()
        if (cached) {
            SteamIntegration.logger.info(`Loading library from source: cache (${cached.provenance.channel}, ${cached.games.length} games)`)
            await this.applyLibrary(cached)
            return
        }

        const scan = await loadLocalSteamLibrary()
        if (scan.library) {
            SteamIntegration.logger.info(`Loading library from source: local-scan (${scan.library.games.length} games)`)
            if (await this.applyLibrary(scan.library)) {
                persistLibrary(scan.library)
            }
            return
        }

        if (scan.steamId) {
            SteamIntegration.logger.info(`Loading library from source: online (steamId ${scan.steamId})`)
            await loadOnlineLibrary(scan.steamId, undefined, this.onlineLoaderDeps())
            return
        }

        SteamIntegration.logger.info('Loading library from source: demo')
        await this.loadDemoGames()
    }

    /** Wires the substrate callbacks OnlineLibraryLoader renders through - see its own docs. */
    private onlineLoaderDeps(): OnlineLibraryLoaderDeps {
        return {
            steamClient: this.steamClient,
            gameLibrary: this.gameLibrary,
            onLoaded: (userInput) => this.storeSteamDataAndEmitEvent(userInput),
            onFailureFallback: () => this.loadDemoGames(),
            isAnonymous: () => this.isAnonymous(),
        }
    }

    /** Thin wrapper - see DemoLibraryLoader for the actual work. */
    private async loadDemoGames(): Promise<void> {
        return loadDemoLibrary({
            steamClient: this.steamClient,
            gameLibrary: this.gameLibrary,
            onLoaded: () => this.storeSteamDataAndEmitEvent(null),
            emitGamesInBatches: (games) => this.emitGamesInBatches(games),
        })
    }

    /** Thin wrapper - see ImportLibraryHandler for the actual work. */
    private async handleImportLibrary(event: CustomEvent<SteamImportLibraryEvent>): Promise<void> {
        return handleImportLibrary(event, {
            applyLibrary: (library) => this.applyLibrary(library),
        })
    }

    /**
     * Renders a Library immediately from whatever's already known — ownership fields plus a
     * read-only AppDetailsCache join, no network fetch. The single render path for both a
     * freshly-captured import and a persisted Library restored on startup, regardless of
     * channel (Library's whole point — see docs/plans/library-source-convergence-plan.md).
     *
     * No automatic background re-fetch after this - handleGameStart picks exactly one source at
     * startup (cache → local disk → online → demo) and stops. A deliberate, explicitly-delayed
     * network freshness pass is separate, future work - not an automatic follow-up to every render.
     *
     * Returns whether the render succeeded, so callers only persist a library they could
     * actually show.
     *
     * The diff against whatever's currently rendered (this.gameLibrary, not the incoming
     * library's own provenance) lets GameBoxSpawner reconcile instead of a blanket reset - keep
     * unchanged games' GPU texture slots, only clear the ones that are actually gone or renamed.
     */
    private async applyLibrary(library: Library): Promise<boolean> {
        try {
            // Every real source (cache, local-scan, online) funnels through here - the startup
            // waterfall's most common case is a persisted-library cache hit, which never runs
            // loadLocalSteamLibrary() at all, so this can't live there (see
            // registerLocalLibraryArt's own doc comment). Awaited before anything else below so
            // GameArtworkProvider's local-art index is populated before placement starts
            // requesting textures, not racing it.
            await registerLocalLibraryArt(new Set(library.games.map(g => g.appid)))

            const currentGames = this.gameLibrary.getState().userData?.games
            if (currentGames?.length) {
                const diff = computeLibraryDiff(library.games, currentGames)
                this.eventManager.emit<StorePropsLibraryReloadRequestEvent>(StorePropsEventTypes.LibraryReloadRequest, {
                    incomingGameCount: library.games.length,
                    removedGameNames: [...diff.removedGames.map(g => g.name), ...diff.renamedGames.map(g => g.oldName)]
                })
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

    /**
     * Thin event wrapper - see OnlineLibraryLoader for the actual work. Stays on SteamIntegration
     * (rather than moving into OnlineLibraryLoader) because it needs this.steamId, the
     * currently-known session identity, as a fallback for a reload with no explicit userInput
     * (e.g. the cache-clear panel's "reload").
     */
    private async handleLoadLibrary(event: CustomEvent<SteamLoadLibraryEvent>): Promise<void> {
        const { userInput, forceUpdate } = event.detail
        const targetInput = userInput || this.steamId

        if (!targetInput) {
            SteamIntegration.logger.warn('No user input or current user provided, cannot load library')
            return
        }

        await loadOnlineLibrary(targetInput, forceUpdate, this.onlineLoaderDeps())
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
