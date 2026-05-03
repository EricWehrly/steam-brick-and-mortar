/**
 * Steam Integration Manager
 *
 * High-level Steam game library integration that orchestrates:
 * - Steam API calls
 * - Progressive loading workflow
 * - Steam data transformation
 * - Cache management
 */

import { SteamApiClient, type SteamGame, type SteamResolveResponse } from '../steam'
import { ANONYMOUS_STORE_USER } from '../steam/fixtures/demo-games'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { SteamGameData } from '../scene'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, AppSettingsEventTypes, GameEventTypes, AppEventTypes } from '../types/InteractionEvents'
import type {
    SteamLoadLibraryEvent,
    SteamCacheClearEvent,
    SteamGamesBatchEvent,
    SteamDataLoadedEvent,
    SteamLibraryManifestReadyEvent,
} from '../types/InteractionEvents'
import type { GameDataReadyEvent } from '../types/EnvironmentEvents'
import type { SettingChangedEvent } from '../core/AppSettings'
import { AppSettings, Setting } from '../core/AppSettings'
import { DataManager, DataDomain } from '../core/data'
import { sortByNumericField } from '../scene/categorization/GameSortFunctions'
import { StorePropsEventTypes } from '../scene/props/PropsEvents'
import type { StorePropsLibraryReloadRequestEvent } from '../scene/props/PropsEvents'

export interface SteamIntegrationConfig {
    apiBaseUrl?: string
    maxGames?: number
}

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
    private config: {
        apiBaseUrl: string
        maxGames: number
    }

    static getInstance(): SteamIntegration | null {
        return SteamIntegration._instance
    }

    constructor(config: SteamIntegrationConfig = {}) {
        this.config = {
            apiBaseUrl: config.apiBaseUrl || 'https://steam-api-dev.wehrly.com',
            maxGames: config.maxGames || 10
        }

        this.eventManager = EventManager.getInstance()
        this.steamClient = new SteamApiClient(this.config.apiBaseUrl)
        this.gameLibrary = new GameLibraryManager()

        SteamIntegration._instance = this

        // Register event handlers directly - no workflow manager needed
        this.registerEventHandlers()
    }

    private registerEventHandlers(): void {
        this.eventManager.registerEventHandler(SteamEventTypes.LoadLibrary, this.handleLoadLibrary.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.handleClearCache.bind(this))
        this.eventManager.registerEventHandler(AppSettingsEventTypes.Changed, this.handleSettingsChange.bind(this))
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
            displayName,
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
            maxGames: this.config.maxGames,
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
        const cachedUsers = this.steamClient.getCachedUsers()

        // Empty-start fallback: load demo games when no cached profile exists.
        // This keeps first-run experiences from stalling on an empty world.
        if (cachedUsers.length === 0) {
            SteamIntegration.logger.info('No cached user - loading anonymous store')
            await this.loadDemoGames()
            return
        }

        if (!AppSettings.get('autoLoadProfile')) {
            SteamIntegration.logger.debug('Auto-load disabled')
            this.eventManager.emit(AppEventTypes.StartupComplete, {})
            return
        }

        const user = cachedUsers[0]
        SteamIntegration.logger.info(`Auto-load: ${user.displayName} (${user.vanityUrl})`)

        this.eventManager.emit<SteamLoadLibraryEvent>(SteamEventTypes.LoadLibrary, {
            userInput: user.vanityUrl
        })
    }

    /**
     * Load hardcoded demo games for dev/test environments.
     * Emits games directly into the batch pipeline - no network calls.
     */
    private async loadDemoGames(): Promise<void> {
        try {
            const demoUser = ANONYMOUS_STORE_USER
            const games = demoUser.games as SteamGame[]
            const BATCH_SIZE = 18
            const totalBatches = Math.ceil(games.length / BATCH_SIZE)

            // Register games in gameLibrary so they're available for storeSteamDataAndEmitEvent().
            // We set vanity_url and steamid to empty strings (not undefined) so the UI can access
            // them without crashes, but isAnonymous() returns true because steam.userInput is not set.
            this.gameLibrary.setUserData({ ...demoUser, vanity_url: '', steamid: '' })

            this.storeSteamDataAndEmitEvent(null)

            // Emit games directly as batch events - no Steam API network calls.
            for (let i = 0; i < totalBatches; i++) {
                const batchGames = games.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).map(game => ({
                    ...game
                }))
                EventManager.getInstance().emit<SteamGamesBatchEvent>(
                    SteamEventTypes.GamesBatchReady,
                    { games: batchGames, batchIndex: i, totalBatches }
                )
                if (i < totalBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }

            SteamIntegration.logger.info(`Demo store loaded: ${games.length} games in ${totalBatches} batches`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load demo games:', error)
        }
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
            SteamIntegration.logger.info(forceUpdate ? 'Library load (forced update) completed' : 'Library load completed')
        } catch (error) {
            SteamIntegration.logger.error('Library load failed:', error)
        }
    }

    private async handleClearCache(_event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        await this.steamClient.clearCache()
        this.gameLibrary.clear()
    }

    private async handleSettingsChange(event: CustomEvent<SettingChangedEvent>): Promise<void> {
        const { settingName, value } = event.detail

        if (settingName !== Setting.DevelopmentMode) return

        const maxGames = value ? 20 : 9999        
        this.config.maxGames = maxGames
    }
}
