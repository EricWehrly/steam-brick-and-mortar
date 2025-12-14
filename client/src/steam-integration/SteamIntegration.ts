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
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { GameLibraryManager, type GameLibraryState } from './GameLibraryManager'
import type { SteamGameData } from '../scene'
import { SteamErrorMessages, type SteamErrorContext } from '../utils/SteamErrorMessages'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, AppSettingsEventTypes } from '../types/InteractionEvents'
import type { SteamLoadGamesEvent, SteamLoadFromCacheEvent, SteamCacheRefreshEvent, SteamCacheClearEvent, SteamGamesBatchEvent, SteamDataLoadedEvent } from '../types/InteractionEvents'
import type { SettingChangedEvent } from '../core/AppSettings'
import { DataManager, DataDomain } from '../core/data'

export interface SteamIntegrationConfig {
    apiBaseUrl?: string
    maxGames?: number
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
    }
    
    /**
     * Store Steam data in DataManager and emit event
     * CRITICAL: Data ownership - store data before emitting events that depend on it
     */
    private storeSteamDataAndEmitEvent(userInput: string): void {
        const gameLibraryState = this.getGameLibraryState()
        const games: SteamGameData[] = gameLibraryState.userData?.games || []
        
        SteamIntegration.logger.debug(`Storing ${games.length} games in DataManager`)
        if (games.length > 0) {
            SteamIntegration.logger.debug(`First game: ${games[0].name} - artwork:${games[0].artwork?.header ? 'yes' : 'no'}`)
        }
        
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
            
            // Step 2: Progressive loading with cache-first batch emission
            // onBatchReady callback handles batch events directly from SteamApiClient
            await this.steamClient.loadGamesProgressively(userGames, {
                maxGames: this.config.maxGames,
                onProgress: (current: number, total: number) => {
                    const percentage = Math.round((current / total) * 90) + 10 // Reserve 10% for initial fetch
                    callbacks.onProgress?.(percentage, 100, `Loaded ${current}/${total} games`)
                },
                onBatchReady: (batchGames, batchIndex, totalBatches) => {
                    // Update game library
                    for (const game of batchGames) {
                        this.gameLibrary.updateGameData(game)
                    }
                    
                    // Emit batch event for progressive shelf rendering
                    this.eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                        games: batchGames as ReadonlyArray<Readonly<SteamGame>>,
                        batchIndex,
                        totalBatches
                    })
                }
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
            
            // Single-pass load with onBatchReady for progressive rendering
            await this.steamClient.loadGamesProgressively(cachedGames, {
                maxGames: cachedGames.game_count,
                onProgress: (current: number, total: number) => {
                    const percentage = Math.round((current / total) * 80) + 10 // 10-90%
                    callbacks.onProgress?.(percentage, 100, `Loading ${current}/${total} games`)
                },
                onBatchReady: (batchGames, batchIndex, totalBatches) => {
                    // Update game library
                    for (const game of batchGames) {
                        this.gameLibrary.updateGameData(game)
                    }
                    
                    // Emit batch event for progressive shelf rendering
                    this.eventManager.emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                        games: batchGames as ReadonlyArray<Readonly<SteamGame>>,
                        batchIndex,
                        totalBatches
                    })
                }
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
    
    private async handleLoadGames(event: CustomEvent<SteamLoadGamesEvent>): Promise<void> {
        const { userInput } = event.detail
        
        try {
            SteamIntegration.logger.info(`Starting load games for: ${userInput}`)
            
            // Use existing loadGamesForUser method which already has progress handling
            await this.loadGamesForUser(userInput)
            
            SteamIntegration.logger.info(`Load games completed successfully`)
            this.storeSteamDataAndEmitEvent(userInput)
            
        } catch (error) {
            SteamIntegration.logger.error('Load games failed:', error)
        }
    }
    
    private async handleLoadFromCache(event: CustomEvent<SteamLoadFromCacheEvent>): Promise<void> {
        const { userInput } = event.detail
        
        try {
            if (!this.hasCachedData(userInput)) {
                SteamIntegration.logger.warn('No cached data found. Please use "Load My Games" first.')
                return
            }
            
            await this.loadGamesFromCache(userInput)
            SteamIntegration.logger.info(`Load from cache completed successfully`)
            this.storeSteamDataAndEmitEvent(userInput)
            
        } catch (error) {
            SteamIntegration.logger.error('Load from cache failed:', error)
        }
    }

    private async handleRefreshCache(event: CustomEvent<SteamCacheRefreshEvent>): Promise<void> {
        try {
            SteamIntegration.logger.info('Starting cache refresh')
            
            const result = await this.refreshData()
            if (!result) {
                SteamIntegration.logger.warn('No data to refresh.')
                return
            }
            
            SteamIntegration.logger.info('Cache refresh completed successfully')
            
            const gameState = this.getGameLibraryState()
            if (gameState.userData?.vanity_url) {
                this.storeSteamDataAndEmitEvent(gameState.userData.vanity_url)
            }
            
        } catch (error) {
            SteamIntegration.logger.error('Cache refresh failed:', error)
        }
    }

    private async handleClearCache(event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        try {
            SteamIntegration.logger.info('Starting cache clear')
            await this.clearCache()
            SteamIntegration.logger.info('Cache cleared successfully!')
        } catch (error) {
            SteamIntegration.logger.error('Cache clear failed:', error)
        }
    }

    private async handleSettingsChange(event: CustomEvent<SettingChangedEvent>): Promise<void> {
        const { key, value } = event.detail
        
        // Only handle development mode changes
        if (key !== 'developmentMode') {
            return
        }
        
        try {
            const isEnabled = value as boolean
            const maxGames = isEnabled ? 20 : 100
            this.updateMaxGames(maxGames)
            
            const message = isEnabled 
                ? `🔧 Development mode enabled (limiting to ${maxGames} games for faster testing)`
                : `📚 Development mode disabled (showing up to ${maxGames} games)`
            
            SteamIntegration.logger.info(message)
        } catch (error) {
            SteamIntegration.logger.error('Development mode setting change failed:', error)
        }
    }
}
