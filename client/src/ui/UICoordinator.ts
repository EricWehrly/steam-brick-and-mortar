/**
 * UI Coordinator - High-Level UI Event Coordination and Management
 * 
 * This coordinator handles complex UI workflows that involve multiple
 * UI components and external systems:
 * - Settings button and pause menu integration
 * - Steam loading workflow coordination
 * - WebXR UI state management
 * - Cache management UI workflows
 * 
 * The App should only need to call setupUI() and basic event handlers
 * without managing individual UI component interactions.
 */

import * as THREE from 'three'
import { UIManager } from '../ui/UIManager'
import { PauseMenuManager } from '../ui/pause/PauseMenuManager'
import { PerformanceMonitor } from '../ui/PerformanceMonitor'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes, WebXREventTypes, InputEventTypes, UIEventTypes } from '../types/InteractionEvents'
import type { DebugStats, DebugStatsProvider } from '../core/DebugStatsProvider'
import type { WebXRCapabilities } from '../webxr/WebXRManager'
import type { ImageCacheStats } from '../steam/images/ImageManager'

/**
 * Coordinates high-level UI workflows and component interactions
 */
export class UICoordinator {
    private uiManager: UIManager
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitor
    private eventManager: EventManager
    private debugStatsProvider: DebugStatsProvider
    private cacheStatsProvider?: () => Promise<ImageCacheStats>

    constructor(
        performanceMonitor: PerformanceMonitor,
        debugStatsProvider: DebugStatsProvider,
        cacheStatsProvider?: () => Promise<ImageCacheStats>
    ) {
        if (!performanceMonitor) {
            throw new Error('PerformanceMonitor is required')
        }
        if (!debugStatsProvider) {
            throw new Error('DebugStatsProvider is required')
        }

        this.performanceMonitor = performanceMonitor
        this.debugStatsProvider = debugStatsProvider
        this.cacheStatsProvider = cacheStatsProvider
        this.eventManager = EventManager.getInstance()

        // Initialize UI Manager with Steam and WebXR event handlers that emit events
        this.uiManager = new UIManager({
            steamLoadGames: (vanityUrl: string) => this.emitSteamLoadGamesEvent(vanityUrl),
            steamLoadFromCache: (vanityUrl: string) => this.emitSteamLoadFromCacheEvent(vanityUrl),
            steamUseOffline: (vanityUrl: string) => this.emitSteamUseOfflineEvent(vanityUrl),
            steamRefreshCache: () => this.emitSteamRefreshCacheEvent(),
            steamClearCache: () => this.emitSteamClearCacheEvent(),
            steamShowCacheStats: () => this.emitSteamCacheStatsEvent(),
            webxrEnterVR: () => this.emitWebXRToggleEvent()
        })

        // Initialize Pause Menu System
        this.pauseMenuManager = new PauseMenuManager(
            {
                containerId: 'pause-menu-overlay',
                overlayClass: 'pause-menu-overlay',
                menuClass: 'pause-menu'
            },
            {
                onPauseInput: () => this.emitInputPauseEvent('menu'),
                onResumeInput: () => this.emitInputResumeEvent('menu'),
                onMenuOpen: () => this.emitMenuOpenEvent('pause'),
                onMenuClose: () => this.emitMenuCloseEvent('pause')
            }
        )
    }

    /**
     * Complete UI setup - call this once during app initialization
     */
    async setupUI(renderer: THREE.WebGLRenderer): Promise<void> {
        // Initialize UI Manager
        this.uiManager.init()

        // Initialize pause menu system
        this.pauseMenuManager.init()
        
        // Provide system dependencies for settings management
        this.pauseMenuManager.setSystemDependencies({
            performanceMonitor: this.performanceMonitor,
            renderer: renderer
        })
        
        // Register all default panels with event emissions
        this.pauseMenuManager.registerDefaultPanels({
            onGetImageCacheStats: this.cacheStatsProvider || (() => Promise.resolve({ totalImages: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 })),
            onClearImageCache: async () => this.emitClearImageCacheEvent(),
            onGetDebugStats: () => this.requestDebugStats()
        })

        // Initialize the settings button that opens the pause menu
        this.initializeSettingsButton()

        // Hide loading and start performance monitoring
        this.uiManager.hideLoading()
        this.performanceMonitor.start()
    }

    /**
     * Update WebXR support status in UI
     */
    updateWebXRSupport(capabilities: WebXRCapabilities): void {
        this.uiManager.setWebXRSupported(capabilities.supportsImmersiveVR)
    }

    /**
     * Update WebXR session state in UI
     */
    updateWebXRSessionState(isActive: boolean): void {
        this.uiManager.setWebXRSessionActive(isActive)
    }

    /**
     * Show error message in UI
     */
    showError(message: string): void {
        this.uiManager.showError(message)
    }

    /**
     * Update cache statistics display
     */
    updateCacheStats(stats: { totalEntries: number; cacheHits: number; cacheMisses: number }): void {
        this.uiManager.updateCacheStats(stats)
    }

    /**
     * Update progress display for Steam loading
     */
    updateProgress(current: number, total: number, message: string): void {
        this.uiManager.updateProgress(current, total, message)
    }

    /**
     * Show/hide progress display
     */
    showProgress(show: boolean): void {
        this.uiManager.showProgress(show)
    }

    /**
     * Show Steam status message
     */
    showSteamStatus(message: string, type: 'loading' | 'success' | 'error'): void {
        this.uiManager.showSteamStatus(message, type)
    }

    /**
     * Check offline availability for a vanity URL
     */
    checkOfflineAvailability(vanityUrl: string): void {
        this.uiManager.checkOfflineAvailability(vanityUrl)
    }

    /**
     * Enable cache management actions in pause menu
     */
    enableCacheActions(): void {
        this.pauseMenuManager.getCacheManagementPanel()?.enableCacheActions()
    }

    /**
     * Disable cache management actions in pause menu
     */
    disableCacheActions(): void {
        this.pauseMenuManager.getCacheManagementPanel()?.disableCacheActions()
    }

    /**
     * Open the pause menu
     */
    openPauseMenu(): void {
        this.pauseMenuManager.open()
    }

    /**
     * Toggle performance monitor display
     */
    togglePerformanceMonitor(): void {
        this.performanceMonitor.toggle()
    }

    /**
     * Get current performance statistics
     */
    getCurrentPerformanceStats() {
        return this.performanceMonitor.getStats()
    }

    /**
     * Update performance monitor with renderer stats
     */
    updateRenderStats(renderer: THREE.WebGLRenderer): void {
        this.performanceMonitor.updateRenderStats(renderer)
    }

    /**
     * Clean up UI resources
     */
    dispose(): void {
        this.performanceMonitor.dispose()
        this.pauseMenuManager.dispose()
    }

    // Private event handlers

    private async handleWebXRToggle(): Promise<void> {
        this.emitWebXRToggleEvent()
    }

    // Steam event emission methods - replace callbacks with events
    private emitSteamLoadGamesEvent(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.LoadGames, { 
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitSteamLoadFromCacheEvent(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.LoadFromCache, { 
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitSteamUseOfflineEvent(vanityUrl: string): void {
        this.eventManager.emit(SteamEventTypes.UseOffline, { 
            vanityUrl,
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitSteamRefreshCacheEvent(): void {
        this.eventManager.emit(SteamEventTypes.CacheRefresh, {
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitSteamClearCacheEvent(): void {
        this.eventManager.emit(SteamEventTypes.CacheClear, {
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitSteamCacheStatsEvent(): void {
        this.eventManager.emit(SteamEventTypes.CacheStats, {
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    private emitClearImageCacheEvent(): void {
        this.eventManager.emit(SteamEventTypes.ImageCacheClear, {
            timestamp: Date.now(),
            source: 'ui' as const 
        })
    }

    // WebXR and Input event emission methods - replace callbacks with events
    private emitWebXRToggleEvent(): void {
        this.eventManager.emit(WebXREventTypes.Toggle, {
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    private emitInputPauseEvent(reason: 'menu' | 'user' | 'system'): void {
        this.eventManager.emit(InputEventTypes.Pause, {
            reason,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    private emitInputResumeEvent(reason: 'menu' | 'user' | 'system'): void {
        this.eventManager.emit(InputEventTypes.Resume, {
            reason,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    private emitMenuOpenEvent(menuType: 'pause' | 'settings' | 'debug'): void {
        this.eventManager.emit(UIEventTypes.MenuOpen, {
            menuType,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    private emitMenuCloseEvent(menuType: 'pause' | 'settings' | 'debug'): void {
        this.eventManager.emit(UIEventTypes.MenuClose, {
            menuType,
            timestamp: Date.now(),
            source: 'ui' as const
        })
    }

    /**
     * Request debug stats from DebugStatsProvider directly
     */
    private requestDebugStats(): Promise<DebugStats> {
        return this.debugStatsProvider.getDebugStats()
    }

    private initializeSettingsButton(): void {
        const settingsButton = document.getElementById('settings-button')
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.pauseMenuManager.open()
            })
        } else {
            console.warn('Settings button not found in DOM')
        }
    }
}
