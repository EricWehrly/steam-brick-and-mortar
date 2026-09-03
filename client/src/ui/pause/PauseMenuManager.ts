/**
 * PauseMenuManager - Main orchestrator for the pause menu system
 * 
 * Handles menu state, panel switching, and integration with input system
 */

import * as THREE from 'three'
import { PauseMenuPanel } from './PauseMenuPanel'
import { renderTemplate } from '../../utils/TemplateEngine'
import pauseMenuStructureTemplate from '../../templates/pause-menu/main-structure.html?raw'
import '../../styles/pause-menu/pause-menu-manager.css'

// Panel imports for default registration
import { CacheManagementPanel } from './panels/CacheManagementPanel'
import { ControlsPanel } from './panels/ControlsPanel'
import { ApplicationPanel } from './panels/ApplicationPanel'
import { GameSettingsPanel } from './panels/GameSettingsPanel'
import { GraphicsSettingsPanel } from './panels/GraphicsSettingsPanel'
import { CameraSettingsPanel } from './panels/CameraSettingsPanel'
import { DisplayAdvancedPanel } from './panels/DisplayAdvancedPanel'
import type { PerformanceMonitorUI } from '../PerformanceMonitor'
import { EventManager } from '../../core/EventManager'
import { SteamEventTypes, InputEventTypes, UIEventTypes } from '../../types/InteractionEvents'
import type { SteamDataLoadedEvent, CancelPressedEvent, MenuOpenEvent, MenuCloseEvent } from '../../types/InteractionEvents'
import { AppSettings } from '../../core/AppSettings'
import { DebugPanel } from './panels/DebugPanel'

export interface PauseMenuState {
    isOpen: boolean
    activePanel: string | null
    previousFocus: HTMLElement | null
}

export interface PauseMenuConfig {
    displayName?: string
    containerId?: string
    overlayClass?: string
    menuClass?: string
}

export interface SystemDependencies {
    performanceMonitor: PerformanceMonitorUI
    renderer: THREE.WebGLRenderer
}

interface PauseMenuTabGroup {
    id: string
    title: string
    icon: string
    childPanelIds: string[]
    defaultChildPanelId: string
}


export class PauseMenuManager {
    private state: PauseMenuState = {
        isOpen: false,
        activePanel: null,
        previousFocus: null
    }

    private config: Required<PauseMenuConfig>
    private systemDependencies: SystemDependencies | null = null
    private panels: Map<string, PauseMenuPanel> = new Map()
    private tabGroups: Map<string, PauseMenuTabGroup> = new Map()
    private panelParentTabIds: Map<string, string> = new Map()
    private topLevelTabIds: string[] = []
    private lastActivePanelId: string | null = null
    private scrollPositionByPanelId: Map<string, number> = new Map()
    private overlay: HTMLElement | null = null
    private menuContainer: HTMLElement | null = null
    private cacheManagementPanel: CacheManagementPanel | null = null
    private applicationPanel: ApplicationPanel | null = null
    // Tracks any OTHER menuType ('game-box', ...) currently up - see handleOpenMenuPressed's own
    // comment for why this exists.
    private isOtherMenuOpen = false
    private eventManager: EventManager
    private appSettings: AppSettings
    private readonly performanceMonitor: PerformanceMonitorUI

    constructor(
        config: PauseMenuConfig = {},
        systemDependencies: SystemDependencies | undefined,
        eventManager: EventManager,
        appSettings: AppSettings,
        performanceMonitor: PerformanceMonitorUI
    ) {
        this.config = {
            displayName: 'Settings',
            containerId: 'pause-menu-overlay',
            overlayClass: 'pause-menu-overlay',
            menuClass: 'pause-menu',
            ...config
        }
        this.systemDependencies = systemDependencies || null
        this.eventManager = eventManager
        this.appSettings = appSettings
        this.performanceMonitor = performanceMonitor
    }

    init(): void {
        this.createMenuStructure()
        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(
            SteamEventTypes.DataLoaded,
            this.onSteamDataLoaded.bind(this)
        )

        // Replaces the old hardcoded Escape-only keydown listener - InputActionResolver already
        // knows this means OpenMenu for any device (keyboard Escape, gamepad Start, ...), so
        // there's nothing left to check here.
        this.eventManager.registerEventHandler(InputEventTypes.OpenMenuPressed, this.handleOpenMenuPressed)

        // Cancel (gamepad B/Circle, or Escape/Start alongside OpenMenu above) closes the menu if
        // it's open - a pure dismiss, not a toggle, so it never reopens a closed menu.
        this.eventManager.registerEventHandler(InputEventTypes.CancelPressed, this.handleCancelPressed)

        // Tracks other menuTypes ('game-box', ...) so handleOpenMenuPressed can tell "Escape/Start
        // just closed that instead" apart from a genuine request to open THIS menu - see that
        // handler's own comment. Filtered off 'pause' itself - this instance already tracks its
        // own state via this.state.isOpen and doesn't need to hear its own MenuOpen/MenuClose back.
        this.eventManager.registerEventHandler<MenuOpenEvent>(UIEventTypes.MenuOpen, this.handleOtherMenuOpen)
        this.eventManager.registerEventHandler<MenuCloseEvent>(UIEventTypes.MenuClose, this.handleOtherMenuClose)
    }

    // Escape/Start is bound to BOTH OpenMenu and Cancel (see CancelPressedEvent.bundledWithOpenMenu's
    // own doc comment), and OpenMenuPressed fires unconditionally on every such press regardless of
    // what else is currently open. With a game box open, that same Escape press is meant to close
    // the box (GameBoxFoldCoordinator's own CancelPressed handler) - not ALSO pop the settings menu
    // open behind it, which is what toggling unconditionally here did (direct request, 2026-09-02,
    // round four: "esc to close game box opens settings menu"). Skipping the toggle whenever some
    // other menuType is currently up leaves the normal case (nothing else open) unchanged.
    private readonly handleOpenMenuPressed = (): void => {
        if (this.isOtherMenuOpen) {
            return
        }
        this.toggle()
    }

    private readonly handleOtherMenuOpen = (event: CustomEvent<MenuOpenEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            this.isOtherMenuOpen = true
        }
    }

    private readonly handleOtherMenuClose = (event: CustomEvent<MenuCloseEvent>): void => {
        if (event.detail.menuType !== 'pause') {
            this.isOtherMenuOpen = false
        }
    }

    // Skips a Cancel bundled with the SAME OpenMenu press (Escape/Start bind to both - see
    // CancelPressedEvent.bundledWithOpenMenu's own doc comment): handleOpenMenuPressed's toggle()
    // already resolved open/closed for this press, so also closing here immediately undid an
    // open it had just performed, reading as "Escape doesn't open the menu" (direct request,
    // 2026-09-02). A standalone Cancel (gamepad B/Circle, or Escape/Start with nothing bound to
    // OpenMenu) has no such flag and still closes normally.
    private readonly handleCancelPressed = (event: CustomEvent<CancelPressedEvent>): void => {
        if (event.detail?.bundledWithOpenMenu) {
            return
        }
        if (this.state.isOpen) {
            this.close()
        }
    }

    private onSteamDataLoaded(_event: CustomEvent<SteamDataLoadedEvent>): void {
        // DataLoaded is an integration/session signal, used here to refresh
        // cache/account panels after library/session persistence changes.
        if (this.cacheManagementPanel) {
            this.cacheManagementPanel.refreshTemplate()
        }
    }

    setSystemDependencies(dependencies: SystemDependencies): void {
        this.systemDependencies = dependencies
    }

    registerPanel(panel: PauseMenuPanel): void {
        this.panels.set(panel.id, panel)
        panel.init()

        if (this.panelParentTabIds.has(panel.id)) {
            return
        }

        this.addTopLevelTabId(panel.id)
        this.createPanelTab(panel)
    }

    registerTabGroup(group: PauseMenuTabGroup): void {
        this.tabGroups.set(group.id, group)
        group.childPanelIds.forEach(childPanelId => {
            this.panelParentTabIds.set(childPanelId, group.id)
        })

        this.addTopLevelTabId(group.id)
        this.createTopLevelTab(group.id, group.title, group.icon, () => this.showPanel(group.id))
    }

    registerDefaultPanels(): void {
        // Register cache management panel - no longer needs callbacks
        const cachePanel = new CacheManagementPanel()
        this.cacheManagementPanel = cachePanel
        this.registerPanel(cachePanel)

        // Register controls panel
        this.registerPanel(new ControlsPanel())
        
        // Register application panel
        const applicationPanel = new ApplicationPanel({}, this.appSettings, this.eventManager)
        this.applicationPanel = applicationPanel
        this.registerPanel(applicationPanel)
        
        // Register game settings panel
        this.registerPanel(new GameSettingsPanel({}, this.appSettings))

        this.registerTabGroup({
            id: 'display',
            title: 'Display',
            icon: '🖥️',
            // TODO(act3-ui-normalization): add 'ui-settings' child panel when UI Scale slider is implemented.
            childPanelIds: ['graphics-settings', 'camera-settings', 'display-advanced'],
            defaultChildPanelId: 'graphics-settings'
        })
        
        // Register graphics settings panel
        const graphicsPanel = new GraphicsSettingsPanel({}, this.appSettings)
        graphicsPanel.initialize({
            renderer: this.systemDependencies?.renderer
        })
        this.registerPanel(graphicsPanel)

        // Register camera settings panel
        this.registerPanel(new CameraSettingsPanel({}, this.appSettings))

        // Register advanced display tuning panel
        this.registerPanel(new DisplayAdvancedPanel({}, this.appSettings))
    
        const debugPanel = new DebugPanel({}, this.performanceMonitor)
        this.registerPanel(debugPanel)
    }

    toggle(): void {
        if (this.state.isOpen) {
            this.close()
        } else {
            this.open()
        }
    }

    open(panelId?: string): void {
        if (this.state.isOpen) return

        this.state.isOpen = true
        this.state.previousFocus = document.activeElement as HTMLElement

        // Show overlay
        if (this.overlay) {
            this.overlay.style.display = 'flex'
        }

        // Show specific panel or fall back to the last one viewed this session, else first available
        const targetPanel = panelId || this.lastActivePanelId || this.getFirstPanelId()
        if (targetPanel) {
            this.showPanel(targetPanel)
        }

        // This class owns its own open/closed lifecycle - it emits UIEventTypes.MenuOpen itself
        // rather than through a callback relayed by whichever coordinator happens to construct it
        // (direct PR review request, 2026-09-03: "the pause menu manager should be handling this
        // open/close itself"). Anything that reacts to a menu opening (SystemUICoordinator's own
        // pointer-lock/reticle handling and its menu-open counting that pauses InputManager,
        // WebXREventHandler, ...) subscribes to this event directly - this class has no separate
        // "pause input" concept of its own to emit (a prior pass here also emitted
        // InputEventTypes.Pause/Resume directly, which was really the same thing SystemUICoordinator
        // already derives from this exact event - removed per PR review request, 2026-09-03:
        // "Shouldn't the UIManager or UICoordinator track 'is a menu open'?").
        this.eventManager.emit<MenuOpenEvent>(UIEventTypes.MenuOpen, { menuType: 'pause' })
    }

    close(): void {
        if (!this.state.isOpen) return

        this.state.isOpen = false

        this.captureActivePanelMemory()

        // Hide all panels
        this.hideAllPanels()
        
        // Hide overlay
        if (this.overlay) {
            this.overlay.style.display = 'none'
        }

        // Restore focus
        if (this.state.previousFocus) {
            this.state.previousFocus.focus()
            this.state.previousFocus = null
        }

        // See open()'s own comment - emitted directly, not via a callback.
        this.eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'pause' })
    }

    showPanel(panelId: string): void {
        const resolvedPanelId = this.resolvePanelId(panelId)

        // Hide current panel
        if (this.state.activePanel) {
            this.captureActivePanelMemory()
            const currentPanel = this.panels.get(this.state.activePanel)
            currentPanel?.hide()
        }

        // Show new panel
        const panel = this.panels.get(resolvedPanelId)
        if (panel) {
            panel.show()
            this.state.activePanel = resolvedPanelId
            this.lastActivePanelId = resolvedPanelId
            this.renderSubtabs(resolvedPanelId)
            this.updateActiveTab(resolvedPanelId)
            this.updateContentLayout(resolvedPanelId)
            this.restoreScrollPosition(resolvedPanelId)
        }
    }

    private captureActivePanelMemory(): void {
        if (!this.state.activePanel) return

        this.lastActivePanelId = this.state.activePanel
        const scrollTop = document.getElementById('pause-menu-content')?.scrollTop
        if (scrollTop !== undefined) {
            this.scrollPositionByPanelId.set(this.state.activePanel, scrollTop)
        }
    }

    private restoreScrollPosition(panelId: string): void {
        requestAnimationFrame(() => {
            const content = document.getElementById('pause-menu-content')
            if (!content) return
            content.scrollTop = this.scrollPositionByPanelId.get(panelId) ?? 0
        })
    }

    getState(): PauseMenuState {
        return { ...this.state }
    }

    isOpen(): boolean {
        return this.state.isOpen
    }

    private createMenuStructure(): void {
        // Check if pause menu structure already exists
        const existingOverlay = document.getElementById(this.config.containerId)
        if (existingOverlay) {
            console.log('ðŸ”„ Found existing pause menu structure, reusing it')
            this.overlay = existingOverlay
            this.menuContainer = existingOverlay.querySelector(`.${this.config.menuClass}`)
            
            // Verify required elements exist, if not recreate them
            if (!this.menuContainer || !existingOverlay.querySelector('#pause-menu-tabs') || !existingOverlay.querySelector('#pause-menu-subtabs')) {
                console.log('⚠️ Existing structure incomplete, recreating...')
                existingOverlay.remove()
                this.createNewMenuStructure()
            } else {
                // Setup event handlers for existing structure
                this.setupEventHandlers()
                this.setupTabsScrolling()
            }
            return
        }
        
        this.createNewMenuStructure()
    }

    private createNewMenuStructure(): void {
        // Create overlay
        this.overlay = document.createElement('div')
        this.overlay.id = this.config.containerId
        this.overlay.className = this.config.overlayClass
        this.overlay.style.display = 'none'

        // Create menu container
        this.menuContainer = document.createElement('div')
        this.menuContainer.className = this.config.menuClass
        this.menuContainer.innerHTML = renderTemplate(pauseMenuStructureTemplate, {
            displayName: this.config.displayName
        })

        this.overlay.appendChild(this.menuContainer)
        document.body.appendChild(this.overlay)

        this.setupEventHandlers()
        this.setupTabsScrolling()
    }

    private setupEventHandlers(): void {
        if (!this.overlay) return
        
        // Setup close button
        const closeBtn = this.overlay.querySelector('#pause-menu-close')
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close())
        }

        // Setup overlay click to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close()
            }
        })
    }

    private setupTabsScrolling(): void {
        this.attachHorizontalScroll('pause-menu-tabs')
        this.attachHorizontalScroll('pause-menu-subtabs')
    }

    private createPanelTab(panel: PauseMenuPanel): void {
        this.createTopLevelTab(panel.id, panel.title, panel.icon, () => this.showPanel(panel.id))
    }

    private createTopLevelTab(tabId: string, title: string, icon: string, onClick: () => void): void {
        const tabsContainer = document.getElementById('pause-menu-tabs')
        if (!tabsContainer) {
            console.warn(`⚠️ Cannot create tab for '${tabId}': tabs container not found`)
            return
        }

        const existingTab = document.getElementById(`tab-${tabId}`)
        if (existingTab) {
            console.log(`🔄 Tab for '${tabId}' already exists, skipping creation`)
            return
        }

        const tab = document.createElement('button')
        tab.id = `tab-${tabId}`
        tab.className = 'pause-menu-tab'
        tab.innerHTML = `${icon} ${title}`
        tab.addEventListener('click', onClick)
        tabsContainer.appendChild(tab)
    }

    private updateActiveTab(panelId: string): void {
        document.querySelectorAll('.pause-menu-tab').forEach(tab => {
            tab.classList.remove('active')
        })

        document.querySelectorAll('.pause-menu-subtab').forEach(tab => {
            tab.classList.remove('active')
        })

        const topLevelTabId = this.panelParentTabIds.get(panelId) ?? panelId
        const activeTab = document.getElementById(`tab-${topLevelTabId}`)
        if (activeTab) {
            activeTab.classList.add('active')
        }

        const activeSubtab = document.getElementById(`subtab-${panelId}`)
        if (activeSubtab) {
            activeSubtab.classList.add('active')
        }
    }

    private hideAllPanels(): void {
        this.panels.forEach(panel => panel.hide())
        this.state.activePanel = null
        this.renderSubtabs(null)
        this.updateContentLayout(null)
    }

    private getFirstPanelId(): string | undefined {
        return this.topLevelTabIds[0]
    }

    private attachHorizontalScroll(containerId: string): void {
        const tabsContainer = document.getElementById(containerId)
        if (!tabsContainer) return

        tabsContainer.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault()
                tabsContainer.scrollLeft += e.deltaY
            }
        }, { passive: false })
    }

    private addTopLevelTabId(tabId: string): void {
        if (!this.topLevelTabIds.includes(tabId)) {
            this.topLevelTabIds.push(tabId)
        }
    }

    private resolvePanelId(panelId: string): string {
        const group = this.tabGroups.get(panelId)
        if (!group) {
            return panelId
        }

        if (this.state.activePanel && this.panelParentTabIds.get(this.state.activePanel) === group.id) {
            return this.state.activePanel
        }

        return group.defaultChildPanelId
    }

    private renderSubtabs(activePanelId: string | null): void {
        const subtabsContainer = document.getElementById('pause-menu-subtabs')
        if (!subtabsContainer) return

        subtabsContainer.innerHTML = ''

        if (!activePanelId) {
            subtabsContainer.style.display = 'none'
            return
        }

        const groupId = this.panelParentTabIds.get(activePanelId)
        if (!groupId) {
            subtabsContainer.style.display = 'none'
            return
        }

        const group = this.tabGroups.get(groupId)
        if (!group) {
            subtabsContainer.style.display = 'none'
            return
        }

        subtabsContainer.style.display = 'flex'

        group.childPanelIds.forEach(childPanelId => {
            const panel = this.panels.get(childPanelId)
            if (!panel) {
                return
            }

            const subtab = document.createElement('button')
            subtab.id = `subtab-${childPanelId}`
            subtab.className = 'pause-menu-subtab'
            subtab.innerHTML = `${panel.icon} ${panel.title}`
            subtab.addEventListener('click', () => this.showPanel(childPanelId))
            subtabsContainer.appendChild(subtab)
        })
    }

    private updateContentLayout(activePanelId: string | null): void {
        const contentContainer = document.getElementById('pause-menu-content')
        if (!contentContainer) return

        const isDisplayGroupActive = activePanelId !== null && this.panelParentTabIds.get(activePanelId) === 'display'

        if (isDisplayGroupActive) {
            contentContainer.classList.add('display-tab-group-active')
        } else {
            contentContainer.classList.remove('display-tab-group-active')
        }
    }

    dispose(): void {
        // Close menu if open
        if (this.state.isOpen) {
            this.close()
        }

        // It's more complicated, but we could have the eventManager install an "onDispose" hook
        // Remove event listeners
        this.eventManager.removeEventListener(
            SteamEventTypes.DataLoaded,
            this.onSteamDataLoaded.bind(this)
        )
        this.eventManager.deregisterEventHandler(InputEventTypes.OpenMenuPressed, this.handleOpenMenuPressed)
        this.eventManager.deregisterEventHandler(InputEventTypes.CancelPressed, this.handleCancelPressed)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuOpen, this.handleOtherMenuOpen)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.handleOtherMenuClose)

        // Dispose all panels
        this.panels.forEach(panel => {
            try {
                panel.dispose()
            } catch (error) {
                console.warn(`Failed to dispose panel ${panel.id}:`, error)
            }
        })
        this.panels.clear()

        // Remove DOM elements
        if (this.overlay) {
            try {
                this.overlay.remove()
            } catch (error) {
                console.warn('Failed to remove overlay:', error)
            }
            this.overlay = null
        }

        // Reset container reference
        this.menuContainer = null

        // Remove styles
        const styles = document.getElementById('pause-menu-styles')
        if (styles) {
            try {
                styles.remove()
            } catch (error) {
                console.warn('Failed to remove styles:', error)
            }
        }
    }

}
