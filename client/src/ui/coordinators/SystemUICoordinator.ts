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
import { GameLibraryListPanel } from '../GameLibraryListPanel'
import { LayoutControlPanel } from '../LayoutControlPanel'
import { ScenePropsPanel } from '../ScenePropsPanel'
import { EventManager } from '../../core/EventManager'
import { AppSettings } from '../../core/AppSettings'
import {
    UIEventTypes,
    InputEventTypes,
    WebXREventTypes,
    AppSettingsEventTypes,
    type SceneCanvasClickEvent,
    type SceneCanvasWheelEvent,
    type InputPauseEvent,
    type InputResumeEvent,
    type MenuOpenEvent,
    type MenuCloseEvent,
    type InputDevicesChangedEvent
} from '../../types/InteractionEvents'
import type { SettingChangedEvent } from '../../core/AppSettings'
import { InputDeviceKind } from '../../input/InputProfile'
import { RenderLoopRegistry } from '../../scene/RenderLoopRegistry'
import { SceneClickGameBoxRaycast } from '../../scene/interaction/SceneClickGameBoxRaycast'
import { SettingsPanelProjector } from '../../scene/css3d/SettingsPanelProjector'
import { VRSettingsPanelCoordinator } from '../../scene/uikit/VRSettingsPanelCoordinator'
import '../../styles/gamepad-reticle.css'

const RETICLE_ELEMENT_ID = 'gamepad-reticle'
const CENTER_SCREEN_NDC = 0

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
    private gameLibraryListPanel?: GameLibraryListPanel
    private layoutControlPanel?: LayoutControlPanel
    private scenePropsPanel?: ScenePropsPanel
    private eventManager: EventManager
    private appSettings: AppSettings
    private renderLoopRegistry: RenderLoopRegistry
    private renderer?: THREE.WebGLRenderer
    private rendererDomElement?: HTMLCanvasElement
    private sceneClickGameBoxRaycast?: SceneClickGameBoxRaycast
    private settingsPanelProjector: SettingsPanelProjector
    private vrSettingsPanelCoordinator: VRSettingsPanelCoordinator
    private activeMouseDown: { clientX: number; clientY: number; button: number } | null = null
    private pointerDraggedBeyondThreshold = false
    private isXRSessionActive = false
    private reticleElement: HTMLElement | null = null
    private isNonPointerDeviceConnected = false
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

        this.pauseMenuManager = new PauseMenuManager(
            {},
            {
                onPauseInput: this.handlePauseInput,
                onResumeInput: this.handleResumeInput,
                onMenuOpen: this.handlePauseMenuOpened,
                onMenuClose: this.handlePauseMenuClosed
            },
            undefined,
            this.eventManager,
            this.appSettings,
            this.performanceMonitor
        )

        this.settingsPanelProjector = new SettingsPanelProjector(this.eventManager)
        this.vrSettingsPanelCoordinator = new VRSettingsPanelCoordinator(this.eventManager, this.appSettings)
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
            // passive: true - nothing here calls preventDefault(), so the browser doesn't need to
            // wait on this handler before it can start scrolling (moot for this canvas anyway,
            // but the standard default-on posture for a wheel listener that never blocks).
            this.rendererDomElement.addEventListener('wheel', this.handleRendererWheel, { passive: true })
        }

        this.sceneClickGameBoxRaycast = new SceneClickGameBoxRaycast({})
        this.createReticleElement()

        // Initialize pause menu system
        this.pauseMenuManager.init()

        // Provide system dependencies for settings management
        this.pauseMenuManager.setSystemDependencies({
            performanceMonitor: this.performanceMonitor,
            renderer: renderer
        })

        // Register all default panels with event emissions
        this.pauseMenuManager.registerDefaultPanels()

        // Must come after pauseMenuManager.init() - it looks up the #pause-menu-overlay DOM
        // node the pause menu just created.
        this.settingsPanelProjector.init()

        this.vrSettingsPanelCoordinator.init(renderer)

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

        // Spreadsheet-style metadata panel (dev/debug tool)
        this.initializeGameLibraryListPanel()

        // User prop folder panel (see docs/features/user-prop-folder.md)
        this.initializeScenePropsPanel()

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

    private initializeGameLibraryListPanel(): void {
        if (!this.gameLibraryListPanel) {
            this.gameLibraryListPanel = new GameLibraryListPanel()
            this.gameLibraryListPanel.init()
        }
    }

    private initializeScenePropsPanel(): void {
        if (!this.scenePropsPanel) {
            this.scenePropsPanel = new ScenePropsPanel()
            this.scenePropsPanel.init()
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

        // Interact from a device with no cursor (keyboard Enter, gamepad A, ...) - real mouse
        // clicks already dispatch SceneCanvasClick directly from handleRendererMouseUp below.
        this.eventManager.registerEventHandler(InputEventTypes.InteractPressed, this.handleInteractPressed)

        // Gamepad/VR aiming reticle visibility
        this.eventManager.registerEventHandler<InputDevicesChangedEvent>(InputEventTypes.DevicesChanged, this.handleDevicesChanged)
        this.eventManager.registerEventHandler<SettingChangedEvent>(AppSettingsEventTypes.Changed, this.handleSettingChanged)

        // Track XR session state so pointer lock never engages during a VR session
        this.eventManager.registerEventHandler(WebXREventTypes.SessionStart, this.handleXRSessionStart)
        this.eventManager.registerEventHandler(WebXREventTypes.SessionEnd, this.handleXRSessionEnd)
    }

    private readonly handleSettingsButtonClick = (): void => {
        this.pauseMenuManager.toggle()
    }

    private readonly handleLightingControlsButtonClick = (): void => {
        this.toggleLightingControls()
    }

    private readonly handleMenuOpen = (): void => {
        this.pauseMenuManager.open()
        this.updateReticleVisibility()
    }

    private readonly handleMenuClose = (): void => {
        this.pauseMenuManager.close()
        this.updateReticleVisibility()
    }

    private readonly handleInteractPressed = (): void => {
        // While a menu is open (DOM pause menu and/or the VR uikit settings panel - both open
        // together, see VRSettingsPanelCoordinator's doc comment), the menu is what's actually in
        // front of the player; a trigger/Enter/gamepad-A press shouldn't reach through it to
        // select whatever game box happens to be further along the same ray. This was previously
        // an accepted known limitation - fixed here at the single chokepoint every non-mouse
        // Interact press already funnels through, rather than teaching the raycast itself about
        // occlusion.
        if (this.pauseMenuManager.isOpen()) {
            return
        }

        // Simulates a click at the reticle position (screen center) - a real mouse click never
        // reaches here at all (see the registration comment above).
        this.eventManager.emit<SceneCanvasClickEvent>(InputEventTypes.SceneCanvasClick, {
            clientX: 0,
            clientY: 0,
            button: 0,
            ndcX: CENTER_SCREEN_NDC,
            ndcY: CENTER_SCREEN_NDC
        })
    }

    private readonly handleDevicesChanged = (event: CustomEvent<InputDevicesChangedEvent>): void => {
        this.isNonPointerDeviceConnected = event.detail.devices.some(
            device => device.connected && (device.kind === InputDeviceKind.Gamepad || device.kind === InputDeviceKind.VR)
        )
        this.updateReticleVisibility()
    }

    private readonly handleSettingChanged = (event: CustomEvent<SettingChangedEvent>): void => {
        if (event.detail.settingName === 'inputGamepadReticleEnabled') {
            this.updateReticleVisibility()
        }
    }

    private updateReticleVisibility(): void {
        if (!this.reticleElement) {
            return
        }

        const shouldShow = this.isNonPointerDeviceConnected
            && this.appSettings.getSetting('inputGamepadReticleEnabled')
            && !this.pauseMenuManager.isOpen()
        this.reticleElement.style.display = shouldShow ? 'block' : 'none'
    }

    private readonly handleXRSessionStart = (): void => {
        this.isXRSessionActive = true
    }

    private readonly handleXRSessionEnd = (): void => {
        this.isXRSessionActive = false
    }

    private readonly handlePauseInput = (): void => {
        this.eventManager.emit<InputPauseEvent>(InputEventTypes.Pause, { reason: 'menu' })
    }

    private readonly handleResumeInput = (): void => {
        this.eventManager.emit<InputResumeEvent>(InputEventTypes.Resume, { reason: 'menu' })
    }

    private readonly handlePauseMenuOpened = (): void => {
        this.eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })

        // Release the cursor so it's free to use the menu - needed even though Escape already
        // triggers the browser's own pointer-unlock, because a gamepad-bound OpenMenu press
        // doesn't touch Escape at all and would otherwise open the menu with the cursor still captured.
        document.exitPointerLock?.()
    }

    private readonly handlePauseMenuClosed = (): void => {
        this.eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
        this.requestPointerLockIfEnabled()
    }

    private requestPointerLockIfEnabled(): void {
        if (!this.rendererDomElement || this.isXRSessionActive) {
            return
        }

        if (this.appSettings.getSetting('inputMouseLockEnabled')) {
            void this.rendererDomElement.requestPointerLock()?.catch(() => {
                // Browsers can reject this (e.g. transient-activation cooldown after a recent
                // exit, or the document losing focus) - non-fatal, just means the cursor stays free.
            })
        }
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

    private readonly handleRendererWheel = (event: WheelEvent): void => {
        if (!this.rendererDomElement) {
            return
        }

        const rect = this.rendererDomElement.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) {
            return
        }

        const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
        const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.eventManager.emit<SceneCanvasWheelEvent>(InputEventTypes.SceneCanvasWheel, {
            ndcX,
            ndcY,
            deltaY: event.deltaY
        })
    }

    private createReticleElement(): void {
        const element = document.createElement('div')
        element.id = RETICLE_ELEMENT_ID
        element.className = 'gamepad-reticle'
        document.body.appendChild(element)
        this.reticleElement = element
        this.updateReticleVisibility()
    }

    public dispose(): void {
        this.renderLoopRegistry.unregister(this.constructor.name)

        if (this.rendererDomElement) {
            this.rendererDomElement.removeEventListener('mousedown', this.handleRendererMouseDown)
            this.rendererDomElement.removeEventListener('mousemove', this.handleRendererMouseMove)
            this.rendererDomElement.removeEventListener('mouseup', this.handleRendererMouseUp)
            this.rendererDomElement.removeEventListener('contextmenu', this.handleRendererContextMenu)
            this.rendererDomElement.removeEventListener('wheel', this.handleRendererWheel)
            this.rendererDomElement = undefined
        }

        this.sceneClickGameBoxRaycast?.dispose()
        this.sceneClickGameBoxRaycast = undefined
        this.settingsPanelProjector?.dispose()
        this.vrSettingsPanelCoordinator?.dispose()
        this.reticleElement?.remove()
        this.reticleElement = null
        this.pauseMenuManager?.dispose()
        this.performanceMonitor?.dispose()
        this.lightingControlsPanel?.dispose()
        this.categoryReferencePanel?.dispose()
        this.gameLibraryListPanel?.dispose()
        this.layoutControlPanel?.dispose()

        // Remove lighting controls button
        const lightingButton = document.getElementById('lighting-controls-button')
        if (lightingButton?.parentNode) {
            lightingButton.parentNode.removeChild(lightingButton)
        }

    }
}