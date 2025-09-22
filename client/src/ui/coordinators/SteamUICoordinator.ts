/**
 * Steam UI Coordinator - Steam-specific UI workflows and state management
 * 
 * This coordinator handles Steam-related UI operations with direct method calls
 * instead of events for simple operations (following refactor plan feedback).
 * 
 * Responsibilities:
 * - Steam loading workflows
 * - Development mode management  
 * - Cache operations
 * - Progress and status updates
 */

import { EventManager } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'
import { UIManager } from '../UIManager'
import type { SteamWorkflowManager } from '../../steam-integration/SteamWorkflowManager'
import type { SteamIntegration } from '../../steam-integration/SteamIntegration'

export class SteamUICoordinator {
    private eventManager: EventManager
    private steamWorkflowManager?: SteamWorkflowManager
    private steamIntegration?: SteamIntegration

    constructor() {
        this.eventManager = EventManager.getInstance()
    }

    /**
     * Initialize with required dependencies
     */
    init(
        steamWorkflowManager: SteamWorkflowManager,
        steamIntegration: SteamIntegration
    ): void {
        this.steamWorkflowManager = steamWorkflowManager
        this.steamIntegration = steamIntegration
    }

    // Direct method calls for simple operations (no events needed)

    /**
     * Set development mode - direct method call instead of event
     * This addresses the feedback about events being overkill for simple operations
     */
    async setDevMode(enabled: boolean): Promise<void> {
        if (!this.steamWorkflowManager) {
            console.warn('SteamUICoordinator not initialized - cannot set dev mode')
            return
        }

        // Direct method call - simple dev mode toggle (no complex workflow needed)
        console.log(`Dev mode ${enabled ? 'enabled' : 'disabled'}`)
        
        // Could store in localStorage or send to SteamIntegration if needed
        localStorage.setItem('steam-dev-mode', enabled.toString())
    }

    // Event-based methods for complex workflows (keep events for these)

    /**
     * Load Steam games workflow - complex operation with progress callbacks
     */
    loadGames(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.LoadGames, {
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Load games from cache workflow  
     */
    loadFromCache(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.LoadFromCache, {
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Use offline data workflow
     */
    useOffline(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.UseOffline, {
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Refresh cache workflow
     */
    refreshCache(): void {
        this.eventManager.emit(SteamEventTypes.CacheRefresh, {
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Clear cache workflow
     */
    clearCache(): void {
        this.eventManager.emit(SteamEventTypes.CacheClear, {
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Show cache stats in proper UI - no longer uses alert
     */
    showCacheStats(): void {
        if (!this.steamWorkflowManager || !this.steamIntegration) {
            console.warn('SteamUICoordinator not initialized - cannot show cache stats')
            return
        }

        // Get stats and update UI directly - no events or alerts needed
        const stats = this.steamIntegration.getCacheStats()
        UIManager.getInstance().steamUIPanel.updateCacheStats(stats)
    }

    /**
     * Clear image cache workflow
     */
    clearImageCache(): void {
        this.eventManager.emit(SteamEventTypes.ImageCacheClear, {
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    // UI state management methods

    /**
     * Update progress display for Steam loading
     */
    updateProgress(current: number, total: number, message: string): void {
        UIManager.getInstance().progressDisplay.update(current, total, message)
    }

    /**
     * Show/hide progress display
     */
    showProgress(show: boolean): void {
        UIManager.getInstance().progressDisplay.show(show)
    }

    /**
     * Show Steam status message
     */
    showSteamStatus(message: string, type: 'loading' | 'success' | 'error'): void {
        UIManager.getInstance().steamUIPanel.showStatus(message, type)
    }

    /**
     * Check offline availability for a vanity URL
     */
    checkOfflineAvailability(vanityUrl: string): void {
        UIManager.getInstance().steamUIPanel.checkOfflineAvailability(vanityUrl)
    }

    /**
     * Update cache statistics display
     */
    updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
        UIManager.getInstance().steamUIPanel.updateCacheStats(stats)
    }
}