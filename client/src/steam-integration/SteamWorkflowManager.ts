/**
 * Steam Workflow Manager
 * 
 * Handles all Steam-related workflows that were previously 
 * managed in SteamBrickAndMortarApp. This includes:
 * - Game loading workflow with progress tracking
 * - Cache management operations
 */

import type { EventManager } from '../core/EventManager'
import { EventSource } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamLoadGamesEvent, SteamLoadFromCacheEvent, SteamCacheRefreshEvent, SteamCacheClearEvent, SteamCacheStatsEvent, SteamImageCacheClearEvent, SteamDevModeToggleEvent } from '../types/InteractionEvents'
import type { SteamIntegration } from './SteamIntegration'
import type { SceneCoordinator } from '../scene'
import type { UICoordinator } from '../ui'
import { Logger } from '../utils/Logger'
import { SteamErrorMessages } from '../utils/SteamErrorMessages'
import { DataManager, DataDomain } from '../core/data'

export class SteamWorkflowManager {
    private static readonly logger = Logger.withContext(SteamWorkflowManager.name)
    
    private eventManager: EventManager
    private steamIntegration: SteamIntegration
    private sceneCoordinator: SceneCoordinator
    private uiCoordinator: UICoordinator
    private dataManager: DataManager
    
    constructor(
        eventManager: EventManager,
        steamIntegration: SteamIntegration,
        sceneCoordinator: SceneCoordinator,
        uiCoordinator: UICoordinator
    ) {
        this.eventManager = eventManager
        this.steamIntegration = steamIntegration
        this.sceneCoordinator = sceneCoordinator
        this.uiCoordinator = uiCoordinator
        this.dataManager = DataManager.getInstance()
        
        // Register event handlers directly - no intermediate layers
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.onLoadGames.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.LoadFromCache, this.onLoadFromCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.onRefreshCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.onClearCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.onCacheStats.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, this.onClearImageCache.bind(this))
        this.eventManager.registerEventHandler(SteamEventTypes.DevModeToggle, this.onDevModeToggle.bind(this))
    }
    
    /**
     * CRITICAL ARCHITECTURAL PRINCIPLE: Data ownership and state precedence
     * 
     * Store Steam data in DataManager and emit SteamDataLoaded event.
     * This ensures data is established in centralized state BEFORE any components
     * react to the event. Data ownership stays close to source.
     * 
     * Principle: "Things that ARE supercede things that WILL BE"
     * - State must be established before events that depend on that state
     * - Data should be stored by the component closest to its source
     */
    private storeSteamDataAndEmitEvent(userInput: string): void {
        const gameLibraryState = this.steamIntegration.getGameLibraryState()
        const gameCount = gameLibraryState.userData?.games?.length || 0
        
        // FIRST: Store data in centralized DataManager (establish state)
        this.dataManager.set('steam.gameCount', gameCount, {
            domain: DataDomain.SteamIntegration
        })
        
        if (userInput) {
            this.dataManager.set('steam.userInput', userInput, {
                domain: DataDomain.SteamIntegration
            })
        }
        
        SteamWorkflowManager.logger.info(`📊 Stored Steam data in DataManager: ${gameCount} games for ${userInput}`)
        
        // SECOND: Emit event now that state is established (components can safely react)
        this.eventManager.emit(SteamEventTypes.DataLoaded, {
            userInput,
            gameCount,
            timestamp: Date.now(),
            source: EventSource.System
        })
    }
    
    /**
     * Load Steam games workflow
     */
    private async onLoadGames(event: CustomEvent<SteamLoadGamesEvent>): Promise<void> {
        const { userInput } = event.detail
        
        try {
            SteamWorkflowManager.logger.info(`Starting load games workflow for: ${userInput}`)
            
            // Show loading UI - TODO: implement proper UI methods
            // this.uiCoordinator.showLoadingMessage('Loading Steam games...')
            
            // Load games with progress callbacks
            await this.steamIntegration.loadGamesForUser(userInput, {
                onProgress: (current: number, total: number, message: string) => {
                    this.uiCoordinator.steam.updateProgress(current, total, message)
                    SteamWorkflowManager.logger.debug(`Progress: ${current}/${total} - ${message}`)
                },
                onGameLoaded: (game) => {
                    // TODO: Add scene integration for game loading
                    SteamWorkflowManager.logger.debug(`Game loaded: ${game.name}`)
                },
                onStatusUpdate: (message: string, type) => {
                    this.uiCoordinator.steam.showSteamStatus(message, type)
                    SteamWorkflowManager.logger.info(`Status: ${message} (${type})`)
                    
                    // Handle error states by re-enabling UI for retry
                    if (type === 'error') {
                        // Allow the UI to handle error state and re-enable controls
                        // The status message is already shown via showSteamStatus above
                    }
                }
            })
            
            SteamWorkflowManager.logger.info(`Load games workflow completed successfully`)
            
            // Handle successful completion in UI
            this.uiCoordinator.steam.showSteamStatus('Games loaded successfully!', 'success')
            
            // Store data in DataManager and emit event (data ownership principle)
            this.storeSteamDataAndEmitEvent(userInput)
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load games workflow failed:', error)
            // Error message is handled by SteamIntegration via callbacks.onStatusUpdate
            // which provides contextual, user-friendly error messages
        }
    }
    
    /**
     * Load from cache workflow
     */
    private async onLoadFromCache(event: CustomEvent<SteamLoadFromCacheEvent>): Promise<void> {
        const { userInput } = event.detail
        
        try {
            SteamWorkflowManager.logger.info(`Starting load from cache workflow for: ${userInput}`)
            
            // Check if cached data is available
            if (!this.steamIntegration.hasCachedData(userInput)) {
                SteamWorkflowManager.logger.warn('No cached data found. Please use "Load My Games" first.')
                return
            }
            
            // Show loading UI - TODO: implement proper UI methods
            SteamWorkflowManager.logger.info('Loading games from cache...')
            
            // Load games from cache with progress callbacks
            await this.steamIntegration.loadGamesFromCache(userInput, {
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
            
            // Store data in DataManager and emit event (data ownership principle)
            this.storeSteamDataAndEmitEvent(userInput)
            
        } catch (error) {
            SteamWorkflowManager.logger.error('Load from cache workflow failed:', error)
            // Error message handled by SteamIntegration via callbacks for consistency
        }
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
            
            // Store data in DataManager and emit event (data ownership principle)
            const gameState = this.steamIntegration.getGameLibraryState()
            if (gameState.userData?.vanity_url) {
                this.storeSteamDataAndEmitEvent(gameState.userData.vanity_url)
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
                // Call steam UI coordinator directly instead of going through UIManager
                this.uiCoordinator.steam.updateCacheStats(stats)
                SteamWorkflowManager.logger.info('Cache stats displayed successfully!')
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
            
            // Set max games for network calls only - rendering should show all loaded games
            const maxGames = isEnabled ? 20 : 100
            this.steamIntegration.updateMaxGames(maxGames)
            
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
