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
import { SteamErrorMessages, type SteamErrorContext } from '../utils/SteamErrorMessages'
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

export interface ProgressCallbacks {
    onProgress?: (current: number, total: number, message: string) => void
    onStatusUpdate?: (message: string, type: 'loading' | 'success' | 'error') => void
}

export interface LoadGamesOptions {
    maxGames?: number
    onProgress?: (current: number, total: number) => void
}

export class SteamIntegration {
    private static readonly logger = Logger.createLogFunctions(SteamIntegration.name)
    private static _instance: SteamIntegration | null = null
    
    private steamClient: SteamApiClient
    private gameLibrary: GameLibraryManager
    private eventManager: EventManager
    private config: {
        apiBaseUrl: string
        maxGames: number
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
    
    /**
     * Register Steam event handlers directly in SteamIntegration
     */
    private registerEventHandlers(): void {
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.handleLoadGames.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, this.handleLoadFromCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.handleRefreshCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.handleClearCache.bind(this))
        this.eventManager.registerEventHandler(AppSettingsEventTypes.Changed, this.handleSettingsChange.bind(this))
        this.eventManager.registerEventHandler(GameEventTypes.Start, this.handleGameStart.bind(this))
    }
    
    /**
     * Store Steam data in DataManager and emit event
     * CRITICAL: Data ownership - store data before emitting events that depend on it
     */
    private storeSteamDataAndEmitEvent(userInput: string | null): void {
        const gameLibraryState = this.getGameLibraryState()
        const games: SteamGameData[] = gameLibraryState.userData?.games || []
        
        SteamIntegration.logger.debug(`Storing ${games.length} games in DataManager`)
        
        const dataManager = DataManager.getInstance()
        dataManager.set<SteamGameData[]>('steam.games', games, {
            domain: DataDomain.SteamIntegration
        })
        
        if (userInput) {
            dataManager.set('steam.userInput', userInput, {
                domain: DataDomain.SteamIntegration
            })
        }
        
        this.eventManager.emit<SteamDataLoadedEvent>(SteamEventTypes.DataLoaded, {
            userInput
        })
    }

    static getInstance(): SteamIntegration | null {
        return SteamIntegration._instance
    }

    /** Returns true when no user identity has been established (anonymous/demo browse). */
    isAnonymous(): boolean {
        return !DataManager.getInstance().get<string>('steam.userInput')
    }

    /**
     * Load Steam games for a user with progressive loading
     */
    async loadGamesForUser(userInput: string, callbacks: ProgressCallbacks = {}): Promise<GameLibraryState> {
        const parsedInput = ValidationUtils.parseSteamUserInput(userInput)
        let steamId: string | undefined
        let vanityUrl: string
        
        try {
            // Step 1: Get steamID (either directly provided or resolved from custom URL)
            callbacks.onStatusUpdate?.('Loading Steam games...', 'loading')
            callbacks.onProgress?.(0, 100, 'Fetching game library...')
            
            SteamIntegration.logger.info(`Loading games for Steam user: ${parsedInput.value} (type: ${parsedInput.type})`)
            
            if (parsedInput.type === 'steamid') {
                // Direct steamID - no resolution needed
                steamId = parsedInput.value
                vanityUrl = `steamid:${steamId}` // Use a placeholder since we don't know the actual custom URL
            } else {
                // Custom URL - resolve to get steamID
                const resolveResponse = await this.steamClient.resolveVanityUrl(parsedInput.value)
                steamId = resolveResponse.steamid
                vanityUrl = resolveResponse.vanity_url
            }
            
            // Validate we have a steamID before proceeding
            if (!steamId) {
                throw new Error('Failed to obtain valid Steam ID')
            }
            
            const userGames = await this.steamClient.getUserGames(steamId)
            
            // Add the vanity URL to the userGames for reference
            userGames.vanity_url = vanityUrl
            
            // Update game library state
            this.gameLibrary.setUserData(userGames)
            
            callbacks.onProgress?.(10, 100, `Found ${userGames.game_count} games. Loading details for top ${Math.min(this.config.maxGames, userGames.game_count)}...`)
            
            // Progressive loading via events - GameLibraryManager listens to GamesBatchReady
            await this.steamClient.loadGamesProgressively(userGames, {
                maxGames: this.config.maxGames,
                sortFn: sortByNumericField('rtime_last_played', 'playtime_forever'),
            })
            
            // Complete loading - actual count from library state (populated via onBatchReady)
            const actualGamesLoaded = Math.min(this.config.maxGames, userGames.game_count)
            callbacks.onProgress?.(100, 100, 'Loading complete!')
            callbacks.onStatusUpdate?.(
                `✅ Successfully loaded ${actualGamesLoaded} games for ${userGames.vanity_url}!`, 
                'success'
            )
            
            SteamIntegration.logger.info(`Progressive loading complete for ${actualGamesLoaded} games (max: ${this.config.maxGames})`)
            
            return this.gameLibrary.getState()
            
        } catch (error) {
            // Log error with context about what step failed
            const errorMessage = (error as Error).message
            if (errorMessage.includes('vanity') || errorMessage.includes('resolve')) {
                SteamIntegration.logger.error(`Failed to resolve Steam input "${parsedInput.value}" (${parsedInput.type}):`, error)
            } else if (errorMessage.includes('games') || errorMessage.includes('getUserGames')) {
                SteamIntegration.logger.error(`Failed to load games for Steam ID "${steamId || 'Unknown'}":`, error)
            } else {
                SteamIntegration.logger.error(`Failed during Steam integration for "${userInput}":`, error)
            }
            
            // Generate contextual error message based on input and error type
            const errorContext: SteamErrorContext = {
                userInput: userInput,
                parsedInputType: parsedInput.type,
                parsedInputValue: parsedInput.value,
                errorType: SteamErrorMessages.categorizeError(error as Error),
                originalError: error as Error
            }
            
            const userFriendlyMessage = SteamErrorMessages.generateErrorMessage(errorContext)
            callbacks.onStatusUpdate?.(userFriendlyMessage, 'error')
            
            throw error
        }
    }

    async refreshData(callbacks: ProgressCallbacks = {}): Promise<GameLibraryState | null> {
        const currentState = this.gameLibrary.getState()
        
        // TODO: Support refresh without vanity url
        if (!currentState.userData?.vanity_url) {
            callbacks.onStatusUpdate?.('No data to refresh', 'error')
            return null
        }
        
        callbacks.onStatusUpdate?.('🔄 Reloading data...', 'loading')
        return this.loadGamesForUser(currentState.userData.vanity_url, callbacks)
    }

    async clearCache(): Promise<void> {
        await this.steamClient.clearCache()
        this.gameLibrary.clear()
    }

    getGameLibraryState(): GameLibraryState {
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
     * Get all cached users with their vanity URLs and display names
     */
    getCachedUsers(): Array<{ vanityUrl: string, displayName: string, gameCount: number, steamId: string }> {
        // Use the optimized implementation from SteamApiClient
        return this.steamClient.getCachedUsers()
    }

    /**
     * Load games from cache only (no Steam API calls)
     */
    async loadGamesFromCache(userInput: string, callbacks: ProgressCallbacks = {}, clearExisting = true): Promise<GameLibraryState> {
        const parsedInput = ValidationUtils.parseSteamUserInput(userInput)
        
        try {
            callbacks.onStatusUpdate?.('Loading from cache...', 'loading')
            callbacks.onProgress?.(0, 100, 'Reading cached data...')
            
            SteamIntegration.logger.info(`Loading cached games for Steam user: ${parsedInput.value} (type: ${parsedInput.type})`)
            
            // Clear existing games if requested
            if (clearExisting) {
                this.gameLibrary.clear()
            }
            
            // Get steamID (either directly or from cache)
            let steamId: string
            if (parsedInput.type === 'steamid') {
                steamId = parsedInput.value
            } else {
                const cachedSteamId = await this.getCachedSteamId(parsedInput.value)
                if (!cachedSteamId) {
                    throw new Error('No cached resolve data found for custom URL')
                }
                steamId = cachedSteamId
            }

            
            const cachedGames = this.steamClient.getCached<SteamUser>(`games_${steamId}`)
            if (!cachedGames) {
                throw new Error('No cached games data found')
            }
            
            // Update game library state with cached data
            this.gameLibrary.setUserData(cachedGames)
            
            callbacks.onProgress?.(10, 100, `Found ${cachedGames.game_count} games in cache. Loading...`)
            
            // Progressive loading via events - GameLibraryManager listens to GamesBatchReady  
            await this.steamClient.loadGamesProgressively(cachedGames, {
                maxGames: cachedGames.game_count,
                sortFn: sortByNumericField('rtime_last_played', 'playtime_forever'),
            })
            
            const gamesLoaded = this.gameLibrary.getState().userData?.games?.length ?? 0
            
            callbacks.onProgress?.(100, 100, 'Loading complete!')
            callbacks.onStatusUpdate?.(
                `✅ Loaded ${gamesLoaded} games from cache for ${cachedGames.vanity_url}!`, 
                'success'
            )
            
            // NOTE: Don't call storeSteamDataAndEmitEvent here - let the caller handle it
            // to avoid double-triggering shelf generation (maintains consistency with loadGamesForUser)
            
            return this.gameLibrary.getState()
            
        } catch (error) {
            SteamIntegration.logger.error('Failed to load games from cache:', error)
            
            // Generate cache-specific error message
            const errorMessage = error instanceof Error && error.message.includes('No cached')
                ? `❌ No cached data found for "${userInput}". Please use "Load Games" to fetch fresh data from Steam first.`
                : `❌ Failed to load from cache. Try "Load Games" to fetch fresh data from Steam.`
            
            callbacks.onStatusUpdate?.(errorMessage, 'error')
            throw error
        }
    }

    private async getCachedSteamId(vanityUrl: string): Promise<string | null> {
        const resolveKey = `resolve_${vanityUrl.toLowerCase()}`
        const cachedResolve = this.steamClient.getCached<SteamResolveResponse>(resolveKey)
        return cachedResolve?.steamid || null
    }
    


    updateMaxGames(maxGames: number): void {
        this.config.maxGames = maxGames
        SteamIntegration.logger.info(`Updated maxGames setting to: ${maxGames}`)
    }

    // This is only for testing?
    getSteamClient() {
        return this.steamClient
    }
    
    /**
     * Event handlers - migrated from SteamWorkflowManager
     * Eliminates unnecessary pass-through layer
     */
    
    private async handleGameStart(): Promise<void> {
        const cachedUsers = this.getCachedUsers()

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
     * Emits games directly into the batch pipeline — no network calls.
     */
    private async loadDemoGames(): Promise<void> {
        try {
            const demoUser = ANONYMOUS_STORE_USER
            const games = demoUser.games as SteamGame[]
            const BATCH_SIZE = 18
            const totalBatches = Math.ceil(games.length / BATCH_SIZE)


            // Populate library so the binder and detail panel can look up games by appid.
            // We intentionally skip setting a user identity (vanity_url etc.) so the UI
            // shows no Steam profile — this is an anonymous browse experience.
            this.gameLibrary.setUserData({ ...demoUser, vanity_url: '', steamid: '' })
            // Emit games directly as batch events — no Steam API network calls.
            for (let i = 0; i < totalBatches; i++) {
                const batchGames = games.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE).map(g => ({
                    ...g
                }))
                EventManager.getInstance().emit<SteamGamesBatchEvent>(
                    SteamEventTypes.GamesBatchReady,
                    { games: batchGames, batchIndex: i, totalBatches }
                )
                if (i < totalBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }

            this.storeSteamDataAndEmitEvent(null)
            SteamIntegration.logger.info(`Demo store loaded: ${games.length} games in ${totalBatches} batches`)
        } catch (error) {
            SteamIntegration.logger.error('Failed to load demo games:', error)
        }
    }
    
    private async handleLoadGames(event: CustomEvent<SteamLoadGamesEvent>): Promise<void> {
        const { userInput } = event.detail
        
        try {
            await this.loadGamesForUser(userInput)
            this.storeSteamDataAndEmitEvent(userInput)
            SteamIntegration.logger.info('Load games completed')
        } catch (error) {
            SteamIntegration.logger.error('Load games failed:', error)
        }
    }
    
    private async handleLoadFromCache(event: CustomEvent<SteamLoadFromCacheEvent>): Promise<void> {
        const { userInput: vanityUrl } = event.detail
        
        try {
            if (!this.hasCachedData(vanityUrl)) {
                SteamIntegration.logger.warn('No cached data found')
                return
            }
            
            await this.loadGamesFromCache(vanityUrl)
            this.storeSteamDataAndEmitEvent(vanityUrl)
            SteamIntegration.logger.info('Loaded from cache')
        } catch (error) {
            SteamIntegration.logger.error('Load from cache failed:', error)
        }
    }

    private async handleRefreshCache(_event: CustomEvent<SteamCacheRefreshEvent>): Promise<void> {
        try {
            const result = await this.refreshData()
            if (!result) {
                SteamIntegration.logger.warn('No data to refresh')
                return
            }
            
            const gameState = this.getGameLibraryState()
            if (gameState.userData?.vanity_url) {
                this.storeSteamDataAndEmitEvent(gameState.userData.vanity_url)
            }
            SteamIntegration.logger.info('Cache refreshed')
        } catch (error) {
            SteamIntegration.logger.error('Cache refresh failed:', error)
        }
    }

    private async handleClearCache(_event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        try {
            await this.clearCache()
            SteamIntegration.logger.info('Cache cleared')
        } catch (error) {
            SteamIntegration.logger.error('Cache clear failed:', error)
        }
    }

    private async handleSettingsChange(event: CustomEvent<SettingChangedEvent>): Promise<void> {
        const { key, value } = event.detail
        
        if (key !== 'developmentMode') return
        
        try {
            const maxGames = value ? 20 : 100
            this.updateMaxGames(maxGames)
            SteamIntegration.logger.info(`Dev mode ${value ? 'enabled' : 'disabled'}: ${maxGames} games max`)
        } catch (error) {
            SteamIntegration.logger.error('Dev mode setting change failed:', error)
        }
    }
}
