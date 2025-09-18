/**
 * System UI Coordinator - System-level UI management
 * 
 * This coordinator handles system-level UI operations including:
 * - Pause menu management
 * - Performance monitoring
 * - Settings and debugging
 * - Error handling
 */

import * as THREE from 'three'
import { PauseMenuManager } from '../pause/PauseMenuManager'
import { PerformanceMonitor } from '../PerformanceMonitor'
import { EventManager } from '../../core/EventManager'
import { InputEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type { DebugStats, DebugStatsProvider } from '../../core/DebugStatsProvider'
import type { ImageCacheStats } from '../../steam/images/ImageManager'
import type { SteamIntegration } from '../../steam-integration/SteamIntegration'
import type { UIManager } from '../UIManager'

export class SystemUICoordinator {
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitor
    private eventManager: EventManager
    private debugStatsProvider: DebugStatsProvider
    private cacheStatsProvider?: () => Promise<ImageCacheStats>
    private steamIntegration?: SteamIntegration
    private uiManager?: UIManager

    constructor(
        performanceMonitor: PerformanceMonitor,
        debugStatsProvider: DebugStatsProvider,
        cacheStatsProvider?: () => Promise<ImageCacheStats>,
        steamIntegration?: SteamIntegration
    ) {
        this.performanceMonitor = performanceMonitor
        this.debugStatsProvider = debugStatsProvider
        this.cacheStatsProvider = cacheStatsProvider
        this.steamIntegration = steamIntegration
        this.eventManager = EventManager.getInstance()

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
     * Initialize with required dependencies
     */
    init(uiManager: UIManager): void {
        this.uiManager = uiManager
    }

    /**
     * Setup pause menu system
     */
    setupPauseMenu(renderer: THREE.WebGLRenderer): void {
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
            onGetCachedUsers: () => Promise.resolve(this.steamIntegration?.getCachedUsers() ?? []),
            onLoadCachedUser: async (steamId: string) => {
                if (this.steamIntegration) {
                    await this.steamIntegration.loadGamesFromCache(steamId)
                }
            },
            onGetDebugStats: () => this.requestDebugStats()
        })

        // Initialize the settings button that opens the pause menu
        this.initializeSettingsButton()
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
     * Start performance monitoring
     */
    startPerformanceMonitoring(): void {
        this.performanceMonitor.start()
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
     * Show error message
     */
    showError(message: string): void {
        this.uiManager?.showError(message)
    }

    /**
     * Clean up system UI resources
     */
    dispose(): void {
        this.performanceMonitor.dispose()
        this.pauseMenuManager.dispose()
    }

    // Private helper methods

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

    private emitClearImageCacheEvent(): void {
        this.eventManager.emit('steam.imageCacheClear', {
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