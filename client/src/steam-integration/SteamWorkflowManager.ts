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
import { EventSource } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamLoadGamesEvent, SteamLoadFromCacheEvent, SteamUseOfflineEvent, SteamCacheRefreshEvent, SteamCacheClearEvent, SteamCacheStatsEvent, SteamImageCacheClearEvent, SteamDevModeToggleEvent } from '../types/InteractionEvents'
import type { SteamIntegration } from './SteamIntegration'
import type { UICoordinator } from '../ui'
import type { SceneCoordinator } from '../scene'
import { Logger } from '../utils/Logger'

export class SteamWorkflowManager {
    private static readonly logger = Logger.withContext(SteamWorkflowManager.name)
    
    private eventManager: EventManager
    private steamIntegration: SteamIntegration
    private uiCoordinator: UICoordinator
    private sceneCoordinator: SceneCoordinator
    
    constructor(
        eventManager: EventManager,
        steamIntegration: SteamIntegration,
        uiCoordinator: UICoordinator,
        sceneCoordinator: SceneCoordinator
    ) {
        this.eventManager = eventManager
        this.steamIntegration = steamIntegration
        this.uiCoordinator = uiCoordinator
        this.sceneCoordinator = sceneCoordinator
        
        // Register event handlers directly - no intermediate layers
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.onLoadGames.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, this.onLoadFromCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.UseOffline, this.onUseOfflineData.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.onRefreshCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.onClearCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.onCacheStats.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, this.onClearImageCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.DevModeToggle, this.onDevModeToggle.bind(this))
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
                    SteamWorkflowManager.logger.debug(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    // this.uiCoordinator.addGameToScene(game)
                    SteamWorkflowManager.logger.debug(`Game loaded: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    // this.uiCoordinator.showStatusMessage(message, type)
                    SteamWorkflowManager.logger.info(`Status: ${message} (${type})`)
                }
            })
            
            SteamWorkflowManager.logger.info(`Load games workflow completed successfully`)
            
            // Emit steam-data-loaded event for UI components that need to react
            this.eventManager.emit(SteamEventTypes.DataLoaded, {
                vanityUrl,
                gameCount: this.steamIntegration.getGameLibraryState().userData?.games?.length || 0,
                timestamp: Date.now(),
                source: EventSource.System
            })
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load games workflow failed:', error)
            // this.uiCoordinator.showStatusMessage(
            //     'Failed to load Steam games. Please check your profile name and try again.',
            //     'error'
            // )
            SteamWorkflowManager.logger.error('Failed to load Steam games. Please check your profile name and try again.')
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
                SteamWorkflowManager.logger.warn('No cached data found. Please use "Load My Games" first.')
                return
            }
            
            // Show loading UI - TODO: implement proper UI methods
            SteamWorkflowManager.logger.info('Loading games from cache...')
            
            // Load games from cache with progress callbacks
            await this.steamIntegration.loadGamesFromCache(vanityUrl, {
                onProgress: (current: number, total: number, message: string) => {
                    SteamWorkflowManager.logger.debug(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    SteamWorkflowManager.logger.debug(`Game loaded from cache: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    SteamWorkflowManager.logger.info(`Status: ${message} (${type})`)
                }
            })
            
            SteamWorkflowManager.logger.info(`Load from cache workflow completed successfully`)
            
            // Emit steam-data-loaded event for UI components that need to react
            this.eventManager.emit(SteamEventTypes.DataLoaded, {
                vanityUrl,
                gameCount: this.steamIntegration.getGameLibraryState().userData?.games?.length || 0,
                timestamp: Date.now(),
                source: EventSource.System
            })
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load from cache workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to load games from cache. Try "Load My Games" instead.')
        }
    }

    /**
     * Use offline data workflow (placeholder)
     */
    private async onUseOfflineData(event: CustomEvent<SteamUseOfflineEvent>): Promise<void> {
        SteamWorkflowManager.logger.info('Use offline data workflow triggered')
        
        // TODO: Implement offline data functionality
        SteamWorkflowManager.logger.warn('Offline mode is not yet implemented.')
    }

    /**
     * Refresh cache workflow
     */
    private async onRefreshCache(event: CustomEvent<SteamCacheRefreshEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting cache refresh workflow')
            
            // Show loading UI - TODO: implement proper UI methods
            SteamWorkflowManager.logger.info('Refreshing cached data...')
            
            // Refresh data with progress callbacks
            const result = await this.steamIntegration.refreshData({
                onProgress: (current: number, total: number, message: string) => {
                    SteamWorkflowManager.logger.debug(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    SteamWorkflowManager.logger.debug(`Game refreshed: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    SteamWorkflowManager.logger.info(`Status: ${message} (${type})`)
                }
            })
            
            if (!result) {
                SteamWorkflowManager.logger.warn('No data to refresh.')
                return
            }
            
            SteamWorkflowManager.logger.info('Cache refresh workflow completed successfully')
            
            // Emit steam-data-loaded event for UI components that need to react
            const gameState = this.steamIntegration.getGameLibraryState()
            if (gameState.userData?.vanity_url) {
                this.eventManager.emit(SteamEventTypes.DataLoaded, {
                    vanityUrl: gameState.userData.vanity_url,
                    gameCount: gameState.userData.games?.length || 0,
                    timestamp: Date.now(),
                    source: EventSource.System
                })
            }
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Cache refresh workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to refresh cache data.')
        }
    }

    /**
     * Clear cache workflow
     */
    private async onClearCache(event: CustomEvent<SteamCacheClearEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting cache clear workflow')
            
            this.steamIntegration.clearCache()
            SteamWorkflowManager.logger.info('Cache cleared successfully!')
            
            SteamWorkflowManager.logger.info('Cache clear workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Cache clear workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to clear cache.')
        }
    }

    /**
     * Show cache stats workflow
     */
    private async onCacheStats(event: CustomEvent<SteamCacheStatsEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting cache stats workflow')
            
            const stats = this.steamIntegration.getCacheStats()
            if (stats) {
                // Delegate to the UI coordinator's steam interface
                // This maintains the existing architecture while using events
                // The SteamUICoordinator.showCacheStats() method already handles the UI update
                const steamCoordinator = (this.uiCoordinator as any).steam
                if (steamCoordinator && steamCoordinator.showCacheStats) {
                    steamCoordinator.showCacheStats()
                    SteamWorkflowManager.logger.info('Cache stats displayed successfully!')
                } else {
                    SteamWorkflowManager.logger.warn('Steam coordinator not available for cache stats display.')
                }
            } else {
                SteamWorkflowManager.logger.warn('No cache stats available.')
            }
            
            SteamWorkflowManager.logger.info('Cache stats workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Cache stats workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to display cache stats.')
        }
    }

    /**
     * Clear image cache workflow
     */
    private async onClearImageCache(event: CustomEvent<SteamImageCacheClearEvent>): Promise<void> {
        try {
            SteamWorkflowManager.logger.info('Starting image cache clear workflow')
            
            await this.steamIntegration.clearImageCache()
            SteamWorkflowManager.logger.info('Image cache cleared successfully!')
            
            SteamWorkflowManager.logger.info('Image cache clear workflow completed successfully')
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Image cache clear workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to clear image cache.')
        }
    }

    /**
     * Development mode toggle workflow
     */
    private async onDevModeToggle(event: CustomEvent<SteamDevModeToggleEvent>): Promise<void> {
        const { isEnabled } = event.detail
        
        try {
            SteamWorkflowManager.logger.info(`Starting dev mode toggle workflow: ${isEnabled ? 'enabled' : 'disabled'}`)
            
            // Set max games based on development mode
            const maxGames = isEnabled ? 20 : 100
            this.steamIntegration.updateMaxGames(maxGames)
            this.sceneCoordinator.updateMaxGames(maxGames)
            
            const message = isEnabled 
                ? `🔧 Development mode enabled (limiting to ${maxGames} games for faster testing)`
                : `📚 Development mode disabled (showing up to ${maxGames} games)`
            
            SteamWorkflowManager.logger.info(message)
            
            SteamWorkflowManager.logger.info(`Dev mode toggle workflow completed: maxGames set to ${maxGames}`)
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Dev mode toggle workflow failed:', error)
            SteamWorkflowManager.logger.error('Failed to toggle development mode.')
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
