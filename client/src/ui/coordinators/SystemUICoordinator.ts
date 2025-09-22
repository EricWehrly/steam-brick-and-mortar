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
import { EventManager, EventSource } from '../../core/EventManager'
import { InputEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type { SteamLoadFromCacheEvent } from '../../types/InteractionEvents'
import type { DebugStats, DebugStatsProvider } from '../../core/DebugStatsProvider'
import type { ImageCacheStats } from '../../steam/images/ImageManager'
import type { SteamIntegration } from '../../steam-integration/SteamIntegration'
import type { SteamWorkflowManager } from '../../steam-integration/SteamWorkflowManager'
import type { UIManager } from '../UIManager'

export class SystemUICoordinator {
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitor
    private eventManager: EventManager
    private debugStatsProvider: DebugStatsProvider
    private cacheStatsProvider?: () => Promise<ImageCacheStats>
    private steamIntegration?: SteamIntegration
    private steamWorkflowManager?: SteamWorkflowManager
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
        this.pauseMenuManager = new PauseMenuManager()
    }

    public setUIManager(uiManager: UIManager): void {
        this.uiManager = uiManager
    }

    public async init(
        renderer: THREE.WebGLRenderer,
        steamWorkflowManager?: SteamWorkflowManager
    ): Promise<void> {
        this.steamWorkflowManager = steamWorkflowManager
        
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
                if (this.steamWorkflowManager) {
                    this.eventManager.emit<SteamLoadFromCacheEvent>('steam:load-from-cache', { 
                        vanityUrl: steamId,
                        timestamp: Date.now(),
                        source: EventSource.UI
                    })
                } else if (this.steamIntegration) {
                    await this.steamIntegration.loadGamesFromCache(steamId)
                }
            },
            onGetImageUrls: async () => {
                const urls = await (this.steamIntegration?.getAllCachedImageUrls() ?? [])
                return urls
            },
            onGetCachedBlob: async (url: string) => {
                const blob = await (this.steamIntegration?.getCachedImageBlob(url) ?? null)
                return blob
            }
        })

        // Setup event handlers
        this.registerEventHandlers()
        
        // Setup Settings button click handler
        this.setupSettingsButton()
    }

    private setupSettingsButton(): void {
        const settingsButton = document.getElementById('settings-button')
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.pauseMenuManager.toggle()
            })
        }
    }

    private registerEventHandlers(): void {
        // Register UI event handlers for pause menu
        this.eventManager.registerEventHandler(UIEventTypes.MenuOpen, (event) => {
            this.pauseMenuManager.open()
        })

        this.eventManager.registerEventHandler(UIEventTypes.MenuClose, (event) => {
            this.pauseMenuManager.close()
        })
    }

    private async emitClearImageCacheEvent(): Promise<void> {
        this.eventManager.emit('steam:image-cache-clear', {
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    public getPauseMenuManager(): PauseMenuManager {
        return this.pauseMenuManager
    }

    public getPerformanceMonitor(): PerformanceMonitor {
        return this.performanceMonitor
    }

    public updateRenderStats(renderer: THREE.WebGLRenderer): void {
        this.performanceMonitor.updateRenderStats(renderer)
    }

    public dispose(): void {
        this.pauseMenuManager?.dispose()
        this.performanceMonitor?.dispose()
        
        // Deregister event handlers
        // Note: EventManager will handle cleanup of all registered handlers
    }
}