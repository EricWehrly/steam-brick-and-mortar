/**
 * Steam Workflow Manager
 * 
 * Handles all Steam-related workflows that were previously 
 * managed in SteamBrickAndMortarApp. This includes:
 * - Game loading workflow with progress tracking
 * - Cache management operations
 * - Offline data handling
 */

import type { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamLoadGamesEvent, SteamLoadFromCacheEvent, SteamUseOfflineEvent, SteamCacheRefreshEvent, SteamCacheClearEvent, SteamCacheStatsEvent, SteamImageCacheClearEvent } from '../types/InteractionEvents'
import type { SteamIntegration } from './SteamIntegration'
import type { UICoordinator } from '../ui'
import { Logger } from '../utils/Logger'

export class SteamWorkflowManager {
    private static readonly logger = Logger.withContext(SteamWorkflowManager.name)
    
    private eventManager: EventManager
    private steamIntegration: SteamIntegration
    private uiCoordinator: UICoordinator
    private boundHandlers: {
        onLoadGames: (event: CustomEvent<SteamLoadGamesEvent>) => void;
        onLoadFromCache: (event: CustomEvent<SteamLoadFromCacheEvent>) => void;
        onUseOfflineData: (event: CustomEvent<SteamUseOfflineEvent>) => void;
        onRefreshCache: (event: CustomEvent<SteamCacheRefreshEvent>) => void;
        onClearCache: (event: CustomEvent<SteamCacheClearEvent>) => void;
        onShowCacheStats: (event: CustomEvent<SteamCacheStatsEvent>) => void;
        onClearImageCache: (event: CustomEvent<SteamImageCacheClearEvent>) => void;
    }
    
    constructor(
        eventManager: EventManager,
        steamIntegration: SteamIntegration,
        uiCoordinator: UICoordinator
    ) {
        this.eventManager = eventManager
        this.steamIntegration = steamIntegration
        this.uiCoordinator = uiCoordinator
        
        // Bind all handlers to maintain proper 'this' context
        this.boundHandlers = {
            onLoadGames: this.onLoadGames.bind(this),
            onLoadFromCache: this.onLoadFromCache.bind(this),
            onUseOfflineData: this.onUseOfflineData.bind(this),
            onRefreshCache: this.onRefreshCache.bind(this),
            onClearCache: this.onClearCache.bind(this),
            onShowCacheStats: this.onShowCacheStats.bind(this),
            onClearImageCache: this.onClearImageCache.bind(this)
        }
        
        this.registerEventHandlers()
    }
    
    private registerEventHandlers(): void {
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.boundHandlers.onLoadGames)
        this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, this.boundHandlers.onLoadFromCache)
        this.eventManager.registerEventHandler(SteamEventTypes.UseOffline, this.boundHandlers.onUseOfflineData)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.boundHandlers.onRefreshCache)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.boundHandlers.onClearCache)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.boundHandlers.onShowCacheStats)
        this.eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, this.boundHandlers.onClearImageCache)
        // Note: ImageCacheStatsRequest handler removed - stats accessed directly via UICoordinator
    }
    
    /**
     * Load Steam games workflow
     */
    private async onLoadGames(event: CustomEvent<SteamLoadGamesEvent>): Promise<void> {
        const { vanityUrl } = event.detail
        
        try {
            SteamWorkflowManager.logger.info(`Starting load games workflow for: ${vanityUrl}`)
            
            // Show loading UI - TODO: implement proper UI methods
            // this.uiCoordinator.showLoadingMessage('Loading Steam games...')
            
            // Load games with progress callbacks
            await this.steamIntegration.loadGamesForUser(vanityUrl, {
                onProgress: (current: number, total: number, message: string) => {
                    // this.uiCoordinator.updateProgress(current, total, message)
                    console.log(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    // this.uiCoordinator.addGameToScene(game)
                    console.log(`Game loaded: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    // this.uiCoordinator.showStatusMessage(message, type)
                    console.log(`Status: ${message} (${type})`)
                }
            })
            
            SteamWorkflowManager.logger.info(`Load games workflow completed successfully`)
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load games workflow failed:', error)
            // this.uiCoordinator.showStatusMessage(
            //     'Failed to load Steam games. Please check your profile name and try again.',
            //     'error'
            // )
            console.error('Failed to load Steam games. Please check your profile name and try again.')
        }
    }
    
    /**
     * Load from cache workflow
     */
    private async onLoadFromCache(event: CustomEvent<SteamLoadFromCacheEvent>): Promise<void> {
        const { vanityUrl } = event.detail
        
        try {
            SteamWorkflowManager.logger.info(`Starting load from cache workflow for: ${vanityUrl}`)
            
            // Check if cached data is available
            if (!this.steamIntegration.hasCachedData(vanityUrl)) {
                console.error('No cached data found. Please use "Load My Games" first.')
                return
            }
            
            // Show loading UI - TODO: implement proper UI methods
            console.log('Loading games from cache...')
            
            // Load games from cache with progress callbacks
            await this.steamIntegration.loadGamesFromCache(vanityUrl, {
                onProgress: (current: number, total: number, message: string) => {
                    console.log(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    console.log(`Game loaded from cache: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    console.log(`Status: ${message} (${type})`)
                }
            })
            
            SteamWorkflowManager.logger.info(`Load from cache workflow completed successfully`)
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load from cache workflow failed:', error)
            console.error('Failed to load games from cache. Try "Load My Games" instead.')
        }
    }

    /**
     * Use offline data workflow (placeholder)
     */
    private async onUseOfflineData(event: CustomEvent<SteamUseOfflineEvent>): Promise<void> {
        SteamWorkflowManager.logger.info('Use offline data workflow triggered')
        
        // TODO: Implement offline data functionality
        console.warn('Offline mode is not yet implemented.')
    }

    /**
     * Refresh cache workflow
     */
    private async onRefreshCache(event: CustomEvent<SteamCacheRefreshEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting cache refresh workflow')
            
            // Show loading UI - TODO: implement proper UI methods
            console.log('Refreshing cached data...')
            
            // Refresh data with progress callbacks
            const result = await this.steamIntegration.refreshData({
                onProgress: (current: number, total: number, message: string) => {
                    console.log(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    console.log(`Game refreshed: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    console.log(`Status: ${message} (${type})`)
                }
            })
            
            if (!result) {
                console.error('No data to refresh.')
                return
            }
            
            SteamWorkflowManager.logger.info('Cache refresh workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Cache refresh workflow failed:', error)
            console.error('Failed to refresh cache data.')
        }
    }

    /**
     * Clear cache workflow
     */
    private async onClearCache(event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting cache clear workflow')
            
            this.steamIntegration.clearCache()
            console.log('Cache cleared successfully!')
            
            SteamWorkflowManager.logger.info('Cache clear workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Cache clear workflow failed:', error)
            console.error('Failed to clear cache.')
        }
    }

    /**
     * Show cache stats workflow
     */
    private async onShowCacheStats(event: CustomEvent<SteamCacheStatsEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting show cache stats workflow')
            
            const stats = this.steamIntegration.getCacheStats()
            
            // Format stats for display
            const message = `Cache Stats:\n` +
                `- Entries: ${stats.totalEntries}\n` +
                `- Cache hits: ${stats.cacheHits}\n` +
                `- Cache misses: ${stats.cacheMisses}`
            
            console.log(message)
            
            SteamWorkflowManager.logger.info('Show cache stats workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Show cache stats workflow failed:', error)
            console.error('Failed to get cache statistics.')
        }
    }

    /**
     * Clear image cache workflow
     */
    private async onClearImageCache(event: CustomEvent<SteamImageCacheClearEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting image cache clear workflow')
            
            await this.steamIntegration.clearImageCache()
            console.log('Image cache cleared successfully!')
            
            SteamWorkflowManager.logger.info('Image cache clear workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Image cache clear workflow failed:', error)
            console.error('Failed to clear image cache.')
        }
    }

    /**
     * Clean up event handlers when workflow manager is destroyed
     */
    dispose(): void {
        // No deregister calls needed - event manager handles cleanup
        SteamWorkflowManager.logger.info('SteamWorkflowManager disposed')
    }
}
