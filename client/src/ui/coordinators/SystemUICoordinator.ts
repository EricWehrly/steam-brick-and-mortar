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
import { LayoutControlPanel } from '../LayoutControlPanel'
import { EventManager } from '../../core/EventManager'
import { AppSettings } from '../../core/AppSettings'
import { UIEventTypes, InputEventTypes, type SceneCanvasClickEvent } from '../../types/InteractionEvents'
import { RenderLoopRegistry } from '../../scene/RenderLoopRegistry'
import { SceneClickGameBoxRaycast } from '../../scene/interaction/SceneClickGameBoxRaycast'

export class SystemUICoordinator {
    // TODO(input): Keep this coordinator minimal. When input complexity increases,
    // move click/drag discrimination into a dedicated input manager and add:
    // - unified pointer/touch/pen handling
    // - multi-pointer correctness
    // - cancellation/interruption paths (e.g., pointercancel)
    // - camera/control drag-state integration
    private pauseMenuManager: PauseMenuManager
    private performanceMonitor: PerformanceMonitorUI
    private lightingControlsPanel?: LightingControlsPanel
    private categoryReferencePanel?: CategoryReferencePanel
    private layoutControlPanel?: LayoutControlPanel
    private eventManager: EventManager
    private appSettings: AppSettings
    private renderLoopRegistry: RenderLoopRegistry
    private renderer?: THREE.WebGLRenderer
    private rendererDomElement?: HTMLCanvasElement
    private sceneClickGameBoxRaycast?: SceneClickGameBoxRaycast
    private activeMouseDown: { clientX: number; clientY: number; button: number } | null = null
    private pointerDraggedBeyondThreshold = false
    private readonly sceneClickDragThresholdPx = 6
    private lastPerformanceUpdate = 0
    private readonly performanceUpdateInterval = 1000 // Update every second

    constructor(
        eventManager: EventManager,
        appSettings: AppSettings
    ) {
        this.renderLoopRegistry = RenderLoopRegistry.getInstance()

        this.eventManager = eventManager
        this.appSettings = appSettings

        this.performanceMonitor = new PerformanceMonitorUI({
            position: 'top-right',
            showMemory: true,
            showDrawCalls: true,
            updateInterval: 100,
            precision: 1
        })

        this.pauseMenuManager = new PauseMenuManager({}, {}, undefined, this.eventManager, this.appSettings, this.performanceMonitor)
    }

    public async init(
        renderer: THREE.WebGLRenderer
    ): Promise<void> {
        this.renderer = renderer
        this.rendererDomElement = renderer.domElement

        this.performanceMonitor.start()

        if (this.rendererDomElement) {
            this.rendererDomElement.addEventListener('mousedown', this.handleRendererMouseDown)
            this.rendererDomElement.addEventListener('mousemove', this.handleRendererMouseMove)
            this.rendererDomElement.addEventListener('mouseup', this.handleRendererMouseUp)
            this.rendererDomElement.addEventListener('contextmenu', this.handleRendererContextMenu)
        }

        this.sceneClickGameBoxRaycast = new SceneClickGameBoxRaycast({})

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

        // Layout/Group/Sort controls panel — initialized first to appear at the top of the UI group
        this.initializeLayoutControlPanel()

        // Initialize integrated lighting controls panel
        this.initializeLightingControls()

        // Category reference panel (dev/debug tool)
        this.initializeCategoryReferencePanel()

        this.renderLoopRegistry.register(this.constructor.name, this.updatePerformanceStats.bind(this))
    }

    private updatePerformanceStats(now: number, _deltaTime: number): void {
        if (now - this.lastPerformanceUpdate > this.performanceUpdateInterval && this.renderer) {
            this.performanceMonitor.updateRenderStats(this.renderer)
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

    private initializeLayoutControlPanel(): void {
        if (!this.layoutControlPanel) {
            this.layoutControlPanel = new LayoutControlPanel()
            this.layoutControlPanel.init()
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

    private readonly handleRendererMouseDown = (event: MouseEvent): void => {
        this.activeMouseDown = {
            clientX: event.clientX,
            clientY: event.clientY,
            button: event.button
        }
        this.pointerDraggedBeyondThreshold = false
    }

    private readonly handleRendererMouseMove = (event: MouseEvent): void => {
        if (!this.activeMouseDown || this.pointerDraggedBeyondThreshold) {
            return
        }

        const deltaX = event.clientX - this.activeMouseDown.clientX
        const deltaY = event.clientY - this.activeMouseDown.clientY
        const movementSquared = deltaX * deltaX + deltaY * deltaY
        const thresholdSquared = this.sceneClickDragThresholdPx * this.sceneClickDragThresholdPx

        if (movementSquared > thresholdSquared) {
            this.pointerDraggedBeyondThreshold = true
        }
    }

    private readonly handleRendererMouseUp = (event: MouseEvent): void => {
        const mouseDown = this.activeMouseDown
        this.activeMouseDown = null

        if (!mouseDown) {
            return
        }

        if (mouseDown.button !== event.button || this.pointerDraggedBeyondThreshold) {
            this.pointerDraggedBeyondThreshold = false
            return
        }

        this.pointerDraggedBeyondThreshold = false

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

    public dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)

        if (this.rendererDomElement) {
            this.rendererDomElement.removeEventListener('mousedown', this.handleRendererMouseDown)
            this.rendererDomElement.removeEventListener('mousemove', this.handleRendererMouseMove)
            this.rendererDomElement.removeEventListener('mouseup', this.handleRendererMouseUp)
            this.rendererDomElement.removeEventListener('contextmenu', this.handleRendererContextMenu)
            this.rendererDomElement = undefined
        }

        this.sceneClickGameBoxRaycast?.dispose()
        this.sceneClickGameBoxRaycast = undefined
        this.pauseMenuManager?.dispose()
        this.performanceMonitor?.dispose()
        this.lightingControlsPanel?.dispose()
        this.layoutControlPanel?.dispose()

        // Remove lighting controls button
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton?.parentNode) {
            lightingButton.parentNode.removeChild(lightingButton)
        }

    }
}