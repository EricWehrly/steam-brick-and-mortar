/**
 * Steam Workflow Manager
 * 
 * Handles all Steam-related interaction workflows that were previously 
 * managed in SteamBrickAndMortarApp. This includes:
 * - Game loading workflow with progress tracking
 * - Cache management operations
 * - Offline data handling
 * - UI coordination for Steam operations
 * 
 * Listens to interaction events and coordinates between SteamIntegration,
 * UICoordinator, and SteamGameManager.
 */

import { EventManager } from '../core/EventManager'
import { SteamIntegration, type ProgressCallbacks } from './SteamIntegration'
import { SteamGameManager } from '../core/SteamGameManager'
import { UICoordinator } from '../ui/UICoordinator'
import { ValidationUtils } from '../utils'
import { Logger } from '../utils/Logger'
import { SteamEventTypes, UIEventTypes } from '../types/InteractionEvents'
import type {
    SteamLoadGamesEvent,
    SteamUseOfflineEvent,
    SteamCacheClearEvent,
    SteamCacheRefreshEvent,
    SteamCacheStatsEvent,
    SteamImageCacheClearEvent,
    ImageCacheStatsRequestEvent
} from '../types/InteractionEvents'

export class SteamWorkflowManager {
    private static readonly logger = Logger.withContext(SteamWorkflowManager.name)
    private eventManager: EventManager
    private steamIntegration: SteamIntegration
    private steamGameManager: SteamGameManager
    private uiCoordinator: UICoordinator
    private boundHandlers: Record<string, EventListener>
    
    // Store pending image cache stats requests
    private pendingImageStatsRequests: Array<(stats: any) => void> = []

    constructor(
        steamIntegration: SteamIntegration,
        steamGameManager: SteamGameManager,
        uiCoordinator: UICoordinator,
        eventManager?: EventManager
    ) {
        this.steamIntegration = steamIntegration
        this.steamGameManager = steamGameManager
        this.uiCoordinator = uiCoordinator
        this.eventManager = eventManager || EventManager.getInstance()
        
        this.boundHandlers = {
            onLoadGames: this.onLoadGames.bind(this),
            onUseOfflineData: this.onUseOfflineData.bind(this),
            onClearCache: this.onClearCache.bind(this),
            onRefreshCache: this.onRefreshCache.bind(this),
            onShowCacheStats: this.onShowCacheStats.bind(this),
            onClearImageCache: this.onClearImageCache.bind(this),
            onImageCacheStatsRequest: this.onImageCacheStatsRequest.bind(this)
        }
        
        this.setupEventListeners()
        SteamWorkflowManager.logger.info('SteamWorkflowManager initialized')
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(SteamEventTypes.LoadGames, this.boundHandlers.onLoadGames)
        this.eventManager.registerEventHandler(SteamEventTypes.UseOffline, this.boundHandlers.onUseOfflineData)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheClear, this.boundHandlers.onClearCache)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheRefresh, this.boundHandlers.onRefreshCache)
        this.eventManager.registerEventHandler(SteamEventTypes.CacheStats, this.boundHandlers.onShowCacheStats)
        this.eventManager.registerEventHandler(SteamEventTypes.ImageCacheClear, this.boundHandlers.onClearImageCache)
        this.eventManager.registerEventHandler(UIEventTypes.ImageCacheStatsRequest, this.boundHandlers.onImageCacheStatsRequest)
    }

    /**
     * Request image cache stats asynchronously
     * @param callback Function to call with the stats result
     */
    public requestImageCacheStats(callback: (stats: any) => void): void {
        // Add callback to pending requests
        this.pendingImageStatsRequests.push(callback);
        
        // Emit the event to trigger stats retrieval
        this.eventManager.emit(UIEventTypes.ImageCacheStatsRequest, {
            timestamp: Date.now(),
            source: 'system' as const
        });
    }

    private onLoadGames = (event: CustomEvent<SteamLoadGamesEvent>) => {
        this.handleLoadGames(event.detail)
    }

    private onUseOfflineData = (event: CustomEvent<SteamUseOfflineEvent>) => {
        this.handleUseOfflineData(event.detail)
    }

    private onClearCache = (event: CustomEvent<SteamCacheClearEvent>) => {
        this.handleClearCache(event.detail)
    }

    private onRefreshCache = (event: CustomEvent<SteamCacheRefreshEvent>) => {
        this.handleRefreshCache(event.detail)
    }

    private onShowCacheStats = (event: CustomEvent<SteamCacheStatsEvent>) => {
        this.handleShowCacheStats(event.detail)
    }

    private onClearImageCache = (event: CustomEvent<SteamImageCacheClearEvent>) => {
        this.handleClearImageCache(event.detail)
    }

    private async handleLoadGames(event: SteamLoadGamesEvent): Promise<void> {
        SteamWorkflowManager.logger.info(`Loading Steam games for: ${event.vanityUrl}`)
        
        this.prepareForGameLoading()
        
        try {
            const progressCallbacks = this.createProgressCallbacks()
            await this.steamIntegration.loadGamesForUser(event.vanityUrl, progressCallbacks)
            
            this.handleGameLoadingSuccess(event.vanityUrl)
        } catch (error) {
            this.handleGameLoadingError(error)
        }
    }

    private prepareForGameLoading(): void {
        this.steamGameManager.resetGameIndex()
        this.steamGameManager.clearGameBoxes()
        this.uiCoordinator.showProgress(true)
    }

    private createProgressCallbacks(): ProgressCallbacks {
        return {
            onProgress: (current: number, total: number, message: string) => {
                this.uiCoordinator.updateProgress(current, total, message)
            },
            onGameLoaded: async (game) => {
                await this.steamGameManager.addGameBoxToScene(game, this.steamGameManager.getCurrentGameIndex())
            },
            onStatusUpdate: (message: string, type: 'loading' | 'success' | 'error') => {
                this.uiCoordinator.showSteamStatus(message, type)
            }
        }
    }

    private handleGameLoadingSuccess(vanityUrl: string): void {
        this.uiCoordinator.enableCacheActions()
        this.updateCacheStatsDisplay()
        this.uiCoordinator.checkOfflineAvailability(ValidationUtils.extractVanityFromInput(vanityUrl))
        
        setTimeout(() => {
            this.uiCoordinator.showProgress(false)
        }, 2000)
    }

    private handleGameLoadingError(error: unknown): void {
        SteamWorkflowManager.logger.error('Failed to load Steam games:', error)
        this.uiCoordinator.showSteamStatus(
            `❌ Failed to load games. Please check the Steam profile name and try again.`, 
            'error'
        )
        this.uiCoordinator.showProgress(false)
        this.uiCoordinator.disableCacheActions()
    }

    private async handleUseOfflineData(event: SteamUseOfflineEvent): Promise<void> {
        const hasOfflineData = this.steamIntegration.hasOfflineData(event.vanityUrl)
        
        if (!hasOfflineData) {
            this.uiCoordinator.showSteamStatus('Offline mode not available in simplified client', 'error')
        } else {
            this.uiCoordinator.showSteamStatus('Loading offline data...', 'loading')
        }
    }

    private async handleRefreshCache(_event: SteamCacheRefreshEvent): Promise<void> {
        try {
            const progressCallbacks = this.createProgressCallbacks()
            await this.steamIntegration.refreshData(progressCallbacks)
            this.updateCacheStatsDisplay()
        } catch (error) {
            SteamWorkflowManager.logger.error('Failed to refresh cache:', error)
        }
    }

    private handleClearCache(_event: SteamCacheClearEvent): void {
        this.steamIntegration.clearCache()
        this.uiCoordinator.showSteamStatus('🗑️ Cache cleared successfully', 'success')
        this.updateCacheStatsDisplay()
    }

    private handleShowCacheStats(_event: SteamCacheStatsEvent): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiCoordinator.updateCacheStats(stats)
    }

    private async handleClearImageCache(_event: SteamImageCacheClearEvent): Promise<void> {
        await this.steamIntegration.clearImageCache()
        this.updateCacheStatsDisplay()
    }

    private updateCacheStatsDisplay(): void {
        const stats = this.steamIntegration.getCacheStats()
        this.uiCoordinator.updateCacheStats(stats)
    }

    private async onImageCacheStatsRequest(): Promise<void> {
        try {
            if (!this.steamIntegration) return;
            
            // Get image cache stats
            const cacheStats = await this.steamIntegration.getImageCacheStats();
            
            // Process any pending requests
            const callbacks = [...this.pendingImageStatsRequests];
            this.pendingImageStatsRequests.length = 0;
            
            // Fulfill all pending callbacks
            callbacks.forEach(callback => callback(cacheStats));
            
        } catch (error) {
            console.error('Error getting image cache stats:', error);
            
            // Call pending callbacks with null to indicate error
            const callbacks = [...this.pendingImageStatsRequests];
            this.pendingImageStatsRequests.length = 0;
            callbacks.forEach(callback => callback(null));
        }
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(SteamEventTypes.LoadGames, this.boundHandlers.onLoadGames)
        this.eventManager.deregisterEventHandler(SteamEventTypes.UseOffline, this.boundHandlers.onUseOfflineData)
        this.eventManager.deregisterEventHandler(SteamEventTypes.CacheClear, this.boundHandlers.onClearCache)
        this.eventManager.deregisterEventHandler(SteamEventTypes.CacheRefresh, this.boundHandlers.onRefreshCache)
        this.eventManager.deregisterEventHandler(SteamEventTypes.CacheStats, this.boundHandlers.onShowCacheStats)
        this.eventManager.deregisterEventHandler(SteamEventTypes.ImageCacheClear, this.boundHandlers.onClearImageCache)
        this.eventManager.deregisterEventHandler(UIEventTypes.ImageCacheStatsRequest, this.boundHandlers.onImageCacheStatsRequest)
        
        SteamWorkflowManager.logger.info('SteamWorkflowManager disposed')
    }
}
