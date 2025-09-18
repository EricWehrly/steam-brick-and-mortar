/**
 * UI Coordinator - UI Architecture Orchestrator
 * 
 * Acts like an index.ts file - sets up and exposes specialized coordinators
 * for direct access by the main app. No more pass-through delegation.
 * 
 * Architecture:
 * - steam: SteamUICoordinator - Steam workflows and state management
 * - webxr: WebXRUICoordinator - WebXR-specific UI management  
 * - system: SystemUICoordinator - System-level UI (pause menu, performance, settings)
 * 
 * Usage: app.uiCoordinator.steam.showError() instead of app.uiCoordinator.showError()
 */

import * as THREE from 'three'
import { UIManager } from '../ui/UIManager'
import { PerformanceMonitor } from '../ui/PerformanceMonitor'
import type { DebugStatsProvider } from '../core/DebugStatsProvider'
import type { ImageCacheStats } from '../steam/images/ImageManager'
import type { SteamIntegration } from '../steam-integration/SteamIntegration'
import type { SteamWorkflowManager } from '../steam-integration/SteamWorkflowManager'
import { SteamUICoordinator, WebXRUICoordinator, SystemUICoordinator } from './coordinators'

/**
 * Orchestrates UI architecture by setting up and exposing specialized coordinators
 */
export class UICoordinator {
    private uiManager: UIManager
    
    // Expose coordinators for direct access by the app
    public readonly steam: SteamUICoordinator
    public readonly webxr: WebXRUICoordinator
    public readonly system: SystemUICoordinator

    constructor(
        performanceMonitor: PerformanceMonitor,
        debugStatsProvider: DebugStatsProvider,
        cacheStatsProvider?: () => Promise<ImageCacheStats>,
        steamIntegration?: SteamIntegration
    ) {
        if (!performanceMonitor) {
            throw new Error('PerformanceMonitor is required')
        }
        if (!debugStatsProvider) {
            throw new Error('DebugStatsProvider is required')
        }

        // Initialize specialized coordinators and expose them publicly
        this.steam = new SteamUICoordinator()
        this.webxr = new WebXRUICoordinator()
        this.system = new SystemUICoordinator(
            performanceMonitor,
            debugStatsProvider,
            cacheStatsProvider,
            steamIntegration
        )

        // Initialize UI Manager with Steam and WebXR handlers that delegate to coordinators
        this.uiManager = new UIManager({
            steamLoadGames: (vanityUrl: string) => this.steam.loadGames(vanityUrl),
            steamLoadFromCache: (vanityUrl: string) => this.steam.loadFromCache(vanityUrl),
            steamUseOffline: (vanityUrl: string) => this.steam.useOffline(vanityUrl),
            steamRefreshCache: () => this.steam.refreshCache(),
            steamClearCache: () => this.steam.clearCache(),
            steamShowCacheStats: () => this.steam.showCacheStats(),
            steamDevModeToggle: (isEnabled: boolean) => this.steam.setDevMode(isEnabled),
            webxrEnterVR: () => this.webxr.toggleVR()
        }, steamIntegration!)
    }

    /**
     * Set workflow manager for direct method calls
     */
    setSteamWorkflowManager(steamWorkflowManager: SteamWorkflowManager, steamIntegration: SteamIntegration): void {
        // Initialize coordinators with their dependencies
        this.steam.init(steamWorkflowManager, steamIntegration, this.uiManager)
        this.webxr.init(this.uiManager)
        this.system.init(this.uiManager)
    }

    /**
     * Complete UI setup - call this once during app initialization
     */
    async setupUI(renderer: THREE.WebGLRenderer): Promise<void> {
        // Initialize UI Manager
        this.uiManager.init()

        // Setup specialized coordinators
        this.system.setupPauseMenu(renderer)
        this.system.startPerformanceMonitoring()

        // Hide loading
        this.uiManager.hideLoading()
    }

    /**
     * Clean up UI resources - dispose all coordinators
     */
    dispose(): void {
        this.system.dispose()
    }
}
