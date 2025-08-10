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
import type { DebugStats } from '../core/DebugStatsProvider'
import type { WebXRCapabilities } from '../webxr/WebXRManager'
import type { ImageCacheStats } from '../steam/images/ImageManager'

export interface UICoordinatorCallbacks {
    onWebXRToggle?: () => Promise<void>
    onLoadSteamGames?: (vanityUrl: string) => Promise<void>
    onUseOfflineData?: (vanityUrl: string) => Promise<void>
    onRefreshCache?: () => Promise<void>
    onClearCache?: () => void
    onShowCacheStats?: () => void
    onGetImageCacheStats?: () => Promise<ImageCacheStats>
    onClearImageCache?: () => Promise<void>
    onGetDebugStats?: () => Promise<DebugStats>
    onPauseInput?: () => void
    onResumeInput?: () => void
    onMenuOpen?: () => void
    onMenuClose?: () => void
}

/**
 * Coordinates high-level UI workflows and component interactions
 */
export class UICoordinator {
    private uiManager: UIManager
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitor
    private callbacks: UICoordinatorCallbacks

    constructor(
        performanceMonitor: PerformanceMonitor,
        callbacks: UICoordinatorCallbacks = {}
    ) {
        this.performanceMonitor = performanceMonitor
        this.callbacks = callbacks

        // Initialize UI Manager with Steam and WebXR event handlers
        this.uiManager = new UIManager({
            steamLoadGames: (vanityUrl: string) => this.handleLoadSteamGames(vanityUrl),
            steamUseOffline: (vanityUrl: string) => this.handleUseOfflineData(vanityUrl),
            steamRefreshCache: () => this.handleRefreshCache(),
            steamClearCache: () => this.handleClearCache(),
            steamShowCacheStats: () => this.handleShowCacheStats(),
            webxrEnterVR: () => this.handleWebXRToggle()
        })

        // Initialize Pause Menu System
        this.pauseMenuManager = new PauseMenuManager(
            {
                containerId: 'pause-menu-overlay',
                overlayClass: 'pause-menu-overlay',
                menuClass: 'pause-menu'
            },
            {
                onPauseInput: () => this.handleInputPause(),
                onResumeInput: () => this.handleInputResume(),
                onMenuOpen: () => this.handlePauseMenuOpen(),
                onMenuClose: () => this.handlePauseMenuClose()
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
        
        // Register all default panels with their callbacks
        this.pauseMenuManager.registerDefaultPanels({
            onGetImageCacheStats: () => this.callbacks.onGetImageCacheStats?.(),
            onClearImageCache: () => this.callbacks.onClearImageCache?.(),
            onGetDebugStats: () => this.callbacks.onGetDebugStats?.()
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
        await this.callbacks.onWebXRToggle?.()
    }

    private async handleLoadSteamGames(vanityUrl: string): Promise<void> {
        await this.callbacks.onLoadSteamGames?.(vanityUrl)
    }

    private async handleUseOfflineData(vanityUrl: string): Promise<void> {
        await this.callbacks.onUseOfflineData?.(vanityUrl)
    }

    private async handleRefreshCache(): Promise<void> {
        await this.callbacks.onRefreshCache?.()
    }

    private handleClearCache(): void {
        this.callbacks.onClearCache?.()
    }

    private handleShowCacheStats(): void {
        this.callbacks.onShowCacheStats?.()
    }

    private handleInputPause(): void {
        console.log('⏸️ Input paused')
        this.callbacks.onPauseInput?.()
    }

    private handleInputResume(): void {
        console.log('▶️ Input resumed')
        this.callbacks.onResumeInput?.()
    }

    private handlePauseMenuOpen(): void {
        console.log('📋 Pause menu opened')
        this.callbacks.onMenuOpen?.()
    }

    private handlePauseMenuClose(): void {
        console.log('📋 Pause menu closed')
        this.callbacks.onMenuClose?.()
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
