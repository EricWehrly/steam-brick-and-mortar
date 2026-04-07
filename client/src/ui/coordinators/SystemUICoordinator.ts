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
import { PerformanceMonitorUI } from '../PerformanceMonitor'
import { LightingControlsPanel } from '../LightingControlsPanel'
import { CategoryReferencePanel } from '../CategoryReferencePanel'
import { EventManager } from '../../core/EventManager'
import type { DebugStatsProvider } from '../../core/DebugStatsProvider'
import { AppSettings } from '../../core/AppSettings'
import { UIEventTypes, InputEventTypes, GameEventTypes, type SceneCanvasClickEvent, type ShelfLayoutDeterminedEvent } from '../../types/InteractionEvents'
import { RenderLoopRegistry } from '../../scene/RenderLoopRegistry'
import { SceneClickGameBoxRaycast } from '../../scene/interaction/SceneClickGameBoxRaycast'

export class SystemUICoordinator {
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitorUI
    private lightingControlsPanel?: LightingControlsPanel
    private categoryReferencePanel?: CategoryReferencePanel
    private eventManager: EventManager
    private appSettings: AppSettings
    private renderLoopRegistry: RenderLoopRegistry
    private renderer?: THREE.WebGLRenderer
    private rendererDomElement?: HTMLCanvasElement
    private sceneClickGameBoxRaycast?: SceneClickGameBoxRaycast
    private lastPerformanceUpdate = 0
    private readonly performanceUpdateInterval = 1000 // Update every second

    constructor(
        performanceMonitor: PerformanceMonitorUI,
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
        this.rendererDomElement = renderer.domElement

        if (this.rendererDomElement) {
            this.rendererDomElement.addEventListener('click', this.handleRendererCanvasClick)
            this.rendererDomElement.addEventListener('contextmenu', this.handleRendererContextMenu)
        }

        this.sceneClickGameBoxRaycast = new SceneClickGameBoxRaycast({
            maxDistance: 10,  // updated dynamically on ShelfLayoutDetermined
            lineColor: 0xff0000
        })

        // Update raycast reach when shelf layout is known so far shelves (arc row 4 at ~21.5m)
        // are reachable. Default of 10m predates the arc layout.
        this.eventManager.registerEventHandler<ShelfLayoutDeterminedEvent>(
            GameEventTypes.ShelfLayoutDetermined,
            (event) => {
                const bounds = event.detail.shelfBounds
                // Add 2m margin beyond the furthest shelf face
                const reach = Math.abs(bounds.minZ) + 2
                this.sceneClickGameBoxRaycast?.setMaxDistance(reach)
            }
        )
        
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

        // Category reference panel (dev/debug tool)
        this.initializeCategoryReferencePanel()
        
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
            settingsButton.addEventListener('click', this.handleSettingsButtonClick)
        }
    }

    private setupLightingControlsButton(): void {
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton) {
            lightingButton.addEventListener('click', this.handleLightingControlsButtonClick)
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

    private initializeCategoryReferencePanel(): void {
        if (!this.categoryReferencePanel) {
            this.categoryReferencePanel = new CategoryReferencePanel()
            this.categoryReferencePanel.init()
        }
    }

    private registerEventHandlers(): void {
        // Register UI event handlers for pause menu
        this.eventManager.registerEventHandler(UIEventTypes.MenuOpen, this.handleMenuOpen)
        this.eventManager.registerEventHandler(UIEventTypes.MenuClose, this.handleMenuClose)
    }

    private readonly handleSettingsButtonClick = (): void => {
        this.pauseMenuManager.toggle()
    }

    private readonly handleLightingControlsButtonClick = (): void => {
        this.toggleLightingControls()
    }

    private readonly handleMenuOpen = (): void => {
        this.pauseMenuManager.open()
    }

    private readonly handleMenuClose = (): void => {
        this.pauseMenuManager.close()
    }

    private readonly handleRendererCanvasClick = (event: MouseEvent): void => {
        if (!this.rendererDomElement) {
            return
        }

        const rect = this.rendererDomElement.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
            return
        }

        const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
        const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.eventManager.emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
            clientX: event.clientX,
            clientY: event.clientY,
            button: event.button,
            ndcX,
            ndcY
        })
    }

    private readonly handleRendererContextMenu = (event: MouseEvent): void => {
        event.preventDefault()
    }

    public updateRenderStats(renderer: THREE.WebGLRenderer): void {
        this.performanceMonitor.updateRenderStats(renderer)
    }

    public dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)

        if (this.rendererDomElement) {
            this.rendererDomElement.removeEventListener('click', this.handleRendererCanvasClick)
            this.rendererDomElement.removeEventListener('contextmenu', this.handleRendererContextMenu)
            this.rendererDomElement = undefined
        }

        this.sceneClickGameBoxRaycast?.dispose()
        this.sceneClickGameBoxRaycast = undefined
        this.pauseMenuManager?.dispose()
        this.performanceMonitor?.dispose()
        this.lightingControlsPanel?.dispose()
        
        // Remove lighting controls button
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton?.parentNode) {
            lightingButton.parentNode.removeChild(lightingButton)
        }
        
    }
}