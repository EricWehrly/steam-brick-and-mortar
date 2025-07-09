/**
 * Steam Integration Manager
 * 
 * High-level Steam game library integration that orchestrates:
 * - Steam API calls
 * - Progressive loading workflow
 * - Steam data transformation
 * - Cache management
 */

import { SteamApiClient, type SteamGame } from '../steam'
import { ValidationUtils } from '../utils'
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
    private steamClient: SteamApiClient
    private gameLibrary: GameLibraryManager
    private config: Required<SteamIntegrationConfig>

    constructor(config: SteamIntegrationConfig = {}) {
        this.config = {
            apiBaseUrl: config.apiBaseUrl || 'https://steam-api-dev.wehrly.com',
            maxGames: config.maxGames || 30
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
            
            console.log(`🔍 Loading games for Steam user: ${extractedVanity}`)
            
            const resolveResponse = await this.steamClient.resolveVanityUrl(extractedVanity)
            const userGames = await this.steamClient.getUserGames(resolveResponse.steamid)
            
            // Update game library state
            this.gameLibrary.setUserData(userGames)
            
            callbacks.onProgress?.(10, 100, `Found ${userGames.game_count} games. Loading details...`)
            
            // Step 2: Progressive loading of game details and artwork
            const progressOptions: LoadGamesOptions = {
                maxGames: this.config.maxGames,
                onProgress: (current: number, total: number) => {
                    const percentage = Math.round((current / total) * 90) + 10 // Reserve 10% for initial fetch
                    callbacks.onProgress?.(percentage, 100, `Loaded ${current}/${total} games`)
                },
                onGameLoaded: (game: SteamGame) => {
                    // Update game library and notify caller
                    this.gameLibrary.updateGameData(game)
                    callbacks.onGameLoaded?.(game)
                }
            }
            
            // Start progressive loading
            await this.steamClient.loadGamesProgressively(userGames, progressOptions)
            
            // Complete loading
            callbacks.onProgress?.(100, 100, 'Loading complete!')
            callbacks.onStatusUpdate?.(
                `✅ Successfully loaded ${userGames.game_count} games for ${userGames.vanity_url}!`, 
                'success'
            )
            
            console.log(`✅ Progressive loading complete for ${userGames.game_count} games`)
            
            return this.gameLibrary.getState()
            
        } catch (error) {
            console.error('❌ Failed to load Steam games:', error)
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

    /**
     * Clear all cached data
     */
    clearCache(): void {
        this.steamClient.clearCache()
        this.gameLibrary.clear()
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.steamClient.getCacheStats()
    }

    /**
     * Get current game library state
     */
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
}
