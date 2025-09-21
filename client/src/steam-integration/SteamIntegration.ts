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

export interface SteamIntegrationConfig {
    apiBaseUrl?: string
    maxGames?: number
}

export interface ProgressCallbacks {
    onProgress?: (current: number, total: number, message: string) => void
    onGameLoaded?: (game: SteamGame) => void
    onStatusUpdate?: (message: string, type: 'loading' | 'success' | 'error') => void
}

export interface LoadGamesOptions {
    maxGames?: number
    onProgress?: (current: number, total: number) => void
    onGameLoaded?: (game: SteamGame) => void
}

/**
 * Manages high-level Steam integration workflow
 */
export class SteamIntegration {
    private static readonly logger = Logger.withContext(SteamIntegration.name)
    private steamClient: SteamApiClient
    private gameLibrary: GameLibraryManager
    private config: Required<SteamIntegrationConfig>

    constructor(config: SteamIntegrationConfig = {}) {
        this.config = {
            apiBaseUrl: config.apiBaseUrl || 'https://steam-api-dev.wehrly.com',
            maxGames: config.maxGames || 10
        }
        
        this.steamClient = new SteamApiClient(this.config.apiBaseUrl)
        this.gameLibrary = new GameLibraryManager()
    }

    /**
     * Load Steam games for a user with progressive loading
     */
    async loadGamesForUser(vanityUrl: string, callbacks: ProgressCallbacks = {}): Promise<GameLibraryState> {
        const extractedVanity = ValidationUtils.extractVanityFromInput(vanityUrl)
        
        try {
            // Step 1: Get basic user and game list data
            callbacks.onStatusUpdate?.('Loading Steam games...', 'loading')
            callbacks.onProgress?.(0, 100, 'Fetching game library...')
            
            SteamIntegration.logger.info(`Loading games for Steam user: ${extractedVanity}`)
            
            const resolveResponse = await this.steamClient.resolveVanityUrl(extractedVanity)
            const userGames = await this.steamClient.getUserGames(resolveResponse.steamid)
            
            // Update game library state
            this.gameLibrary.setUserData(userGames)
            
            callbacks.onProgress?.(10, 100, `Found ${userGames.game_count} games. Loading details for top ${Math.min(this.config.maxGames, userGames.game_count)}...`)
            
            // Step 2: Progressive loading of game details and artwork
            const progressOptions: LoadGamesOptions = {
                maxGames: this.config.maxGames,
                onProgress: (current: number, total: number) => {
                    const percentage = Math.round((current / total) * 90) + 10 // Reserve 10% for initial fetch
                    callbacks.onProgress?.(percentage, 100, `Loaded ${current}/${total} games`)
                },
                onGameLoaded: async (game: SteamGame) => {
                    // Update game library and notify caller
                    this.gameLibrary.updateGameData(game)
                    callbacks.onGameLoaded?.(game)
                    
                    // Download game artwork in the background
                    try {
                        // TODO: ROADMAP - Nice to have: Game-level cache awareness
                        // Could add isGameArtworkCached(game) check here to skip downloading
                        // if all artwork for this game is already cached. Currently each
                        // individual image checks cache (which works well), but a game-level
                        // check would prevent unnecessary cache lookups for fully cached games.
                        await this.steamClient.downloadGameArtwork(game)
                        SteamIntegration.logger.debug(`Downloaded artwork for ${game.name}`)
                    } catch (error) {
                        SteamIntegration.logger.warn(`Failed to download artwork for ${game.name}:`, error)
                    }
                }
            }
            
            // Start progressive loading
            await this.steamClient.loadGamesProgressively(userGames, progressOptions)
            
            // Complete loading
            const actualGamesLoaded = Math.min(this.config.maxGames, userGames.game_count)
            callbacks.onProgress?.(100, 100, 'Loading complete!')
            callbacks.onStatusUpdate?.(
                `✅ Successfully loaded ${actualGamesLoaded} games for ${userGames.vanity_url}!`, 
                'success'
            )
            
            SteamIntegration.logger.info(`Progressive loading complete for ${actualGamesLoaded} games (max: ${this.config.maxGames})`)
            
            return this.gameLibrary.getState()
            
        } catch (error) {
            SteamIntegration.logger.error('Failed to load Steam games:', error)
            callbacks.onStatusUpdate?.(
                `❌ Failed to load games. Please check the Steam profile name and try again.`, 
                'error'
            )
            throw error
        }
    }

    /**
     * Refresh cached data for current user
     */
    async refreshData(callbacks: ProgressCallbacks = {}): Promise<GameLibraryState | null> {
        const currentState = this.gameLibrary.getState()
        
        if (!currentState.userData?.vanity_url) {
            callbacks.onStatusUpdate?.('No data to refresh', 'error')
            return null
        }
        
        callbacks.onStatusUpdate?.('🔄 Reloading data...', 'loading')
        return this.loadGamesForUser(currentState.userData.vanity_url, callbacks)
    }

    clearCache(): void {
        this.steamClient.clearCache()
        this.gameLibrary.clear()
    }

    getCacheStats() {
        return this.steamClient.getCacheStats()
    }

    getGameLibraryState(): GameLibraryState {
        return this.gameLibrary.getState()
    }

    /**
     * Check if offline data is available for a user
     */
    hasOfflineData(_vanityUrl: string): boolean {
        // For now, return false as offline mode is not implemented in simplified client
        return false
    }

    /**
     * Check if cached data is available for a user
     * 
     * TODO: Story 5.5.1 (backlogged) - Potential optimization to reduce from 2 cache lookups to 1,
     * but previous implementation created data duplication issues. Consider alternative approaches like
     * single-pass cache check or result memoization if this becomes a performance bottleneck.
     * See docs/active/tech-debt.md for detailed analysis.
     */
    hasCachedData(vanityUrl: string): boolean {
        const extractedVanity = ValidationUtils.extractVanityFromInput(vanityUrl)
        
        // Check if we have cached resolve data
        const resolveKey = `resolve_${extractedVanity.toLowerCase()}`
        const cachedResolve = this.steamClient.getCached<SteamResolveResponse>(resolveKey)
        
        if (!cachedResolve) {
            return false
        }
        
        // Check if we have cached games data for the resolved Steam ID
        const gamesKey = `games_${cachedResolve.steamid}`
        return this.steamClient.hasCached(gamesKey)
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
    async loadGamesFromCache(vanityUrl: string, callbacks: ProgressCallbacks = {}, clearExisting = true): Promise<GameLibraryState> {
        const extractedVanity = ValidationUtils.extractVanityFromInput(vanityUrl)
        
        try {
            callbacks.onStatusUpdate?.('Loading from cache...', 'loading')
            callbacks.onProgress?.(0, 100, 'Reading cached data...')
            
            SteamIntegration.logger.info(`Loading cached games for Steam user: ${extractedVanity}`)
            
            // Clear existing games if requested
            if (clearExisting) {
                this.gameLibrary.clear()
            }
            
            // Get cached resolve and games data
            const steamId = await this.getCachedSteamId(extractedVanity)
            
            if (!steamId) {
                throw new Error('No cached resolve data found')
            }
            
            const cachedGames = this.steamClient.getCached<SteamUser>(`games_${steamId}`)
            if (!cachedGames) {
                throw new Error('No cached games data found')
            }
            
            // Update game library state with cached data
            this.gameLibrary.setUserData(cachedGames)
            
            callbacks.onProgress?.(20, 100, `Loading ${cachedGames.game_count} games from cache...`)
            
            // Process cached games with progress feedback
            const maxGames = Math.min(this.config.maxGames, cachedGames.games.length)
            const sortedGames = [...cachedGames.games]
                .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
                .slice(0, maxGames)

            for (let i = 0; i < sortedGames.length; i++) {
                const game = sortedGames[i]
                
                // Get cached game details or create basic details
                const gameKey = `game_${game.appid}`
                let enhancedGame = this.steamClient.getCached<SteamGame>(gameKey)
                
                if (!enhancedGame) {
                    // Create basic artwork URLs if not cached
                    enhancedGame = {
                        ...game,
                        artwork: {
                            icon: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`,
                            logo: `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`,
                            header: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
                            library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
                        }
                    }
                }
                
                // Update game library and notify caller
                this.gameLibrary.updateGameData(enhancedGame)
                callbacks.onGameLoaded?.(enhancedGame)
                
                const percentage = Math.round(((i + 1) / sortedGames.length) * 80) + 20 // 20-100%
                callbacks.onProgress?.(percentage, 100, `Loaded ${i + 1}/${sortedGames.length} games from cache`)
            }
            
            // Complete loading
            callbacks.onProgress?.(100, 100, 'Cache loading complete!')
            callbacks.onStatusUpdate?.(
                `✅ Loaded ${sortedGames.length} games from cache for ${cachedGames.vanity_url}!`, 
                'success'
            )
            
            SteamIntegration.logger.info(`Cache loading complete for ${sortedGames.length} games`)
            
            return this.gameLibrary.getState()
            
        } catch (error) {
            SteamIntegration.logger.error('Failed to load games from cache:', error)
            callbacks.onStatusUpdate?.(
                `❌ Failed to load from cache. Try "Load My Games" instead.`, 
                'error'
            )
            throw error
        }
    }

    private async getCachedSteamId(vanityUrl: string): Promise<string | null> {
        const resolveKey = `resolve_${vanityUrl.toLowerCase()}`
        const cachedResolve = this.steamClient.getCached<SteamResolveResponse>(resolveKey)
        return cachedResolve?.steamid || null
    }

    /**
     * Get games as SteamGameData for scene rendering
     */
    getGamesForScene(): SteamGameData[] {
        const state = this.gameLibrary.getState()
        return state.userData?.games?.map(game => ({
            appid: game.appid,
            name: game.name,
            playtime_forever: game.playtime_forever,
            playtime_2weeks: game.playtime_2weeks,
            img_icon_url: game.img_icon_url,
            img_logo_url: game.img_logo_url,
            artwork: game.artwork
        })) ?? []
    }
    
    async downloadGameArtwork(game: SteamGame): Promise<Record<string, Blob | null>> {
        return this.steamClient.downloadGameArtwork(game)
    }

    async downloadGameImage(url: string): Promise<Blob | null> {
        return this.steamClient.downloadGameImage(url)
    }

    async getImageCacheStats() {
        return this.steamClient.getImageCacheStats()
    }

    async clearImageCache(): Promise<void> {
        return this.steamClient.clearImageCache()
    }

    async getAllCachedImageUrls(): Promise<string[]> {
        return await this.steamClient.getAllCachedImageUrls()
    }

    async getCachedImageBlob(url: string): Promise<Blob | null> {
        return await this.steamClient.getCachedImageBlob(url)
    }

    /**
     * Update the maximum games setting for development mode
     */
    updateMaxGames(maxGames: number): void {
        this.config.maxGames = maxGames
        SteamIntegration.logger.info(`Updated maxGames setting to: ${maxGames}`)
    }

    /**
     * Get current maxGames setting
     */
    getMaxGames(): number {
        return this.config.maxGames
    }

    /**
     * Provide access to underlying Steam client (for advanced use)
     */
    getSteamClient() {
        return this.steamClient
    }
}
