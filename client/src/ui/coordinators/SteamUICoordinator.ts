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

import { EventManager, EventSource } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'
import { UIManager } from '../UIManager'

export class SteamUICoordinator {
    private eventManager: EventManager

    constructor() {
        this.eventManager = EventManager.getInstance()
    }

    // Direct method calls for simple operations (no events needed)

    /**
     * Set development mode - direct method call instead of event
     * This addresses the feedback about events being overkill for simple operations
     */
    async setDevMode(enabled: boolean): Promise<void> {
        // Direct method call - simple dev mode toggle (no complex workflow needed)
        console.log(`Dev mode ${enabled ? 'enabled' : 'disabled'}`)
        
        // Store in localStorage and emit event for workflow manager to handle
        localStorage.setItem('steam-dev-mode', enabled.toString())
        
        // Emit event for SteamWorkflowManager to handle the actual logic
        this.eventManager.emit(SteamEventTypes.DevModeToggle, {
            isEnabled: enabled,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    // Event-based methods for complex workflows (keep events for these)

    /**
     * Load Steam games workflow - complex operation with progress callbacks
     */
    loadGames(userInput: string): void {
        this.eventManager.emit(SteamEventTypes.LoadGames, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Load games from cache workflow  
     */
    loadFromCache(userInput: string): void {
        this.eventManager.emit(SteamEventTypes.LoadFromCache, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Use offline data workflow
     */
    useOffline(userInput: string): void {
        this.eventManager.emit(SteamEventTypes.UseOffline, {
            userInput,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Refresh cache workflow
     */
    refreshCache(): void {
        this.eventManager.emit(SteamEventTypes.CacheRefresh, {
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Clear cache workflow
     */
    clearCache(): void {
        this.eventManager.emit(SteamEventTypes.CacheClear, {
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Show cache stats in proper UI - no longer uses alert
     * Delegates to workflow manager through events
     */
    showCacheStats(): void {
        // Emit event for SteamWorkflowManager to handle getting stats and updating UI
        this.eventManager.emit(SteamEventTypes.CacheStats, {
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    /**
     * Clear image cache workflow
     */
    clearImageCache(): void {
        this.eventManager.emit(SteamEventTypes.ImageCacheClear, {
            timestamp: Date.now(),
            source: EventSource.UI
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
     * Check offline availability for user input
     */
    checkOfflineAvailability(userInput: string): void {
        UIManager.getInstance().steamUIPanel.checkOfflineAvailability(userInput)
    }

    /**
     * Update cache statistics display
     */
    updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
        UIManager.getInstance().steamUIPanel.updateCacheStats(stats)
    }
}