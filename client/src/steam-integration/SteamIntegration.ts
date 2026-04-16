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
import { ANONYMOUS_STORE_USER } from '../steam/fixtures/demo-games'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { SteamGameData } from '../scene'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, AppSettingsEventTypes, GameEventTypes } from '../types/InteractionEvents'
import type { SteamLoadGamesEvent, SteamLoadFromCacheEvent, SteamCacheRefreshEvent, SteamCacheClearEvent, SteamGamesBatchEvent, SteamDataLoadedEvent } from '../types/InteractionEvents'
import type { SettingChangedEvent } from '../core/AppSettings'
import { AppSettings } from '../core/AppSettings'
import { DataManager, DataDomain } from '../core/data'
import { sortByNumericField } from '../scene/categorization/GameSortFunctions'

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
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.handleLoadGames.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, this.handleLoadFromCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.handleRefreshCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.handleClearCache.bind(this))
        this.eventManager.registerEventHandler(AppSettingsEventTypes.Changed, this.handleSettingsChange.bind(this))
        this.eventManager.registerEventHandler(GameEventTypes.Start, this.handleGameStart.bind(this))
    }

    private storeSteamDataAndEmitEvent(): void {
        const gameLibraryState = this.getGameLibraryState()
        const games: SteamGameData[] = gameLibraryState.userData?.games || []
        this.steamId = gameLibraryState.userData?.steamid

        SteamIntegration.logger.debug(`Storing ${games.length} games in DataManager`)

        const dataManager = DataManager.getInstance()
        dataManager.set<SteamGameData[]>('steam.games', games, {
            domain: DataDomain.SteamIntegration
        })

        this.eventManager.emit<SteamDataLoadedEvent>(SteamEventTypes.DataLoaded)
    }

    async loadGamesForUser(userInput: string, ignoreCache = false): Promise<GameLibraryState> {
        const parsedInput = ValidationUtils.parseSteamUserInput(userInput)
        let steamId: string | undefined
        let vanityUrl: string
        
        SteamIntegration.logger.info(`Loading games for Steam user: ${parsedInput.value} (type: ${parsedInput.type}${ignoreCache ? ', ignoring cache' : ''})`);

        ({ steamId, vanityUrl } = await this.getSteamIdAndVanityUrl(parsedInput, steamId, vanityUrl, ignoreCache))

        const userGames = await this.steamClient.getUserGames(steamId, ignoreCache)
        userGames.steamid = steamId
        userGames.vanity_url = vanityUrl
        this.gameLibrary.setUserData(userGames)
        
        await this.steamClient.loadGamesProgressively(userGames, {
            // TD: TODO: Reinstate max games
            // maxGames: this.config.maxGames,
            sortFn: sortByNumericField('rtime_last_played', 'playtime_forever'),
        })
        
        SteamIntegration.logger.debug(`Progressive loading complete for ${userGames.game_count} games`)

        return this.gameLibrary.getState()
    }

    private async getSteamIdAndVanityUrl(parsedInput: { type: "steamid" | "customurl"; value: string }, steamId: string, vanityUrl: string, ignoreCache: boolean) {
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
        if (!steamId) {
            throw new Error('Failed to obtain valid Steam ID')
        }
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

        // Dev/test fallback: load demo games when no cached user exists, regardless of
        // autoLoadProfile (which defaults false and won't be set in a fresh test env)
        if (cachedUsers.length === 0 && AppSettings.get('developmentMode')) {
            SteamIntegration.logger.info('No cached user - loading anonymous store for dev/test')
            await this.loadDemoGames()
            return
        }

        if (!AppSettings.get('autoLoadProfile')) {
            SteamIntegration.logger.debug('Auto-load disabled')
            return
        }

        if (cachedUsers.length === 0) {
            SteamIntegration.logger.warn('⚠️ Auto-load enabled but no Steam profiles cached yet - user must load a profile first')
            return
        }

        const user = cachedUsers[0]
        SteamIntegration.logger.info(`Auto-load: ${user.displayName} (${user.vanityUrl})`)

        this.eventManager.emit<SteamLoadFromCacheEvent>(SteamEventTypes.LoadFromCache, {
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

            // Anonymous store: do not populate a Steam user identity
            // this.gameLibrary.setUserData(demoUser) - omitted so UI shows no profile
            // Emit games directly as batch events - no Steam API network calls.
            // Strip artwork so game boxes render as text labels immediately, without
            // waiting for CDN fetches that will CORS-fail in test/anonymous contexts.
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

            this.storeSteamDataAndEmitEvent()
            SteamIntegration.logger.info(`Demo store loaded: ${games.length} games in ${totalBatches} batches`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load demo games:', error)
        }
    }

    private async handleLoadGames(event: CustomEvent<SteamLoadGamesEvent>): Promise<void> {
        const { userInput } = event.detail

        try {
            await this.loadGamesForUser(userInput)
            this.storeSteamDataAndEmitEvent()
            SteamIntegration.logger.info('Load games completed')
        } catch (error) {
            SteamIntegration.logger.error('Load games failed:', error)
        }
    }

    private async handleLoadFromCache(event: CustomEvent<SteamLoadFromCacheEvent>): Promise<void> {
        const { userInput: vanityUrl } = event.detail

        if (!this.hasCachedData(vanityUrl)) {
            SteamIntegration.logger.warn('No cached data found')
            return
        }

        await this.loadGamesForUser(vanityUrl, false)
        this.storeSteamDataAndEmitEvent()
        SteamIntegration.logger.info('Loaded from cache')
    }

    private async handleRefreshCache(event: CustomEvent<SteamCacheRefreshEvent>): Promise<void> {
        const { forceUpdate } = event.detail
        try {
            if (!this.steamId) {
                SteamIntegration.logger.warn('No user currently loaded, cannot refresh')
                return
            }
            
            await this.loadGamesForUser(this.steamId, forceUpdate)
            
            const gameState = this.getGameLibraryState()
            if (gameState.userData?.steamid) {
                this.storeSteamDataAndEmitEvent()
            }
            SteamIntegration.logger.info(forceUpdate ? 'Cache force updated from network' : 'Cache refreshed')
        } catch (error) {
            SteamIntegration.logger.error(forceUpdate ? 'Cache force update failed:' : 'Cache refresh failed:', error)
        }
    }

    private async handleClearCache(_event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        await this.steamClient.clearCache()
        this.gameLibrary.clear()
    }

    private async handleSettingsChange(event: CustomEvent<SettingChangedEvent>): Promise<void> {
        const { key, value } = event.detail

        if (key !== 'developmentMode') return

        const maxGames = value ? 20 : 100        
        this.config.maxGames = maxGames
    }
}
