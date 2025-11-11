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
import { LightingControlsPanel } from '../LightingControlsPanel'
import { EventManager } from '../../core/EventManager'
import type { DebugStatsProvider } from '../../core/DebugStatsProvider'
import { AppSettings } from '../../core/AppSettings'
import { UIEventTypes } from '../../types/InteractionEvents'
import { RenderLoopRegistry } from '../../scene/RenderLoopRegistry'

export class SystemUICoordinator {
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitor
    private lightingControlsPanel?: LightingControlsPanel
    private eventManager: EventManager
    private appSettings: AppSettings
    private renderLoopRegistry: RenderLoopRegistry
    private renderer?: THREE.WebGLRenderer
    private lastPerformanceUpdate = 0
    private readonly performanceUpdateInterval = 1000 // Update every second

    constructor(
        performanceMonitor: PerformanceMonitor,
        debugStatsProvider: DebugStatsProvider,
        eventManager: EventManager,
        appSettings: AppSettings
    ) {
        this.performanceMonitor = performanceMonitor
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()
        
        this.eventManager = eventManager
        this.appSettings = appSettings
        this.pauseMenuManager = new PauseMenuManager({}, {}, undefined, this.eventManager, this.appSettings, debugStatsProvider)
    }

    public async init(
        renderer: THREE.WebGLRenderer
    ): Promise<void> {
        this.renderer = renderer
        
        // Initialize pause menu system
        this.pauseMenuManager.init()
        
        // Provide system dependencies for settings management
        this.pauseMenuManager.setSystemDependencies({
            performanceMonitor: this.performanceMonitor,
            renderer: renderer
        })
        
        // Register all default panels with event emissions
        this.pauseMenuManager.registerDefaultPanels()

        // Setup event handlers
        this.registerEventHandlers()
        
        // Setup Settings button click handler
        this.setupSettingsButton()
        
        // Setup Lighting Controls button
        this.setupLightingControlsButton()
        
        // Initialize integrated lighting controls panel
        this.initializeLightingControls()
        
        // Register update method with render loop
        this.renderLoopRegistry.register(this.constructor.name, this.updatePerformanceStats.bind(this))
    }

    private updatePerformanceStats(now: number, _deltaTime: number): void {
        if (now - this.lastPerformanceUpdate > this.performanceUpdateInterval && this.renderer) {
            this.updateRenderStats(this.renderer)
            this.lastPerformanceUpdate = now
        }
    }

    private setupSettingsButton(): void {
        const settingsButton = document.getElementById('settings-button')
        if (settingsButton) {
            settingsButton.addEventListener('click', () => {
                this.pauseMenuManager.toggle()
            })
        }
    }

    private setupLightingControlsButton(): void {
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton) {
            lightingButton.addEventListener('click', () => {
                this.toggleLightingControls()
            })
        }
    }

    private toggleLightingControls(): void {
        if (!this.lightingControlsPanel) {
            // Initialize the panel if it doesn't exist yet
            this.initializeLightingControls()
            return
        }
        
        this.lightingControlsPanel.toggle()
    }

    public initializeLightingControls(): void {
        if (!this.lightingControlsPanel) {
            this.lightingControlsPanel = new LightingControlsPanel(this.eventManager, this.appSettings)
            // Show the integrated panel by default since the button is now part of it
            this.lightingControlsPanel.show()
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

    public getPauseMenuManager(): PauseMenuManager {
        return this.pauseMenuManager
    }

    public getPerformanceMonitor(): PerformanceMonitor {
        return this.performanceMonitor
    }

    public updateRenderStats(renderer: THREE.WebGLRenderer, scene?: THREE.Scene): void {
        this.performanceMonitor.updateRenderStats(renderer)
    }

    public dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)
        this.pauseMenuManager?.dispose()
        this.performanceMonitor?.dispose()
        this.lightingControlsPanel?.dispose()
        
        // Remove lighting controls button
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton?.parentNode) {
            lightingButton.parentNode.removeChild(lightingButton)
        }
        
        // Deregister event handlers
        // Note: EventManager will handle cleanup of all registered handlers
    }
}