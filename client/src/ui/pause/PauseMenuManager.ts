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
import { HelpPanel } from './panels/HelpPanel'
import { ApplicationPanel } from './panels/ApplicationPanel'
import { GameSettingsPanel } from './panels/GameSettingsPanel'
import { GraphicsSettingsPanel } from './panels/GraphicsSettingsPanel'
import { CameraSettingsPanel } from './panels/CameraSettingsPanel'
import type { PerformanceMonitorUI } from '../PerformanceMonitor'
import { EventManager, EventSource } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'
import { LightingEventTypes } from '../../types/LightingEvents'
import type { SteamDataLoadedEvent } from '../../types/InteractionEvents'
import type { LightingToggleEvent, LightingDebugToggleEvent } from '../../types/LightingEvents'
import { AppSettings, type ApplicationSettings } from '../../core/AppSettings'
import { DebugPanel } from './panels/DebugPanel'

export interface PauseMenuState {
    isOpen: boolean
    activePanel: string | null
    inputPaused: boolean
    previousFocus: HTMLElement | null
}

export interface PauseMenuConfig {
    displayName?: string
    containerId?: string
    overlayClass?: string
    menuClass?: string
}

export interface PauseMenuCallbacks {
    onPauseInput?: () => void
    onResumeInput?: () => void
    onMenuOpen?: () => void
    onMenuClose?: () => void
}

export interface SystemDependencies {
    performanceMonitor: PerformanceMonitorUI
    renderer: THREE.WebGLRenderer
}


export class PauseMenuManager {
    private state: PauseMenuState = {
        isOpen: false,
        activePanel: null,
        inputPaused: false,
        previousFocus: null
    }

    private config: Required<PauseMenuConfig>
    private callbacks: PauseMenuCallbacks
    private systemDependencies: SystemDependencies | null = null
    private panels: Map<string, PauseMenuPanel> = new Map()
    private overlay: HTMLElement | null = null
    private menuContainer: HTMLElement | null = null
    private cacheManagementPanel: CacheManagementPanel | null = null
    private applicationPanel: ApplicationPanel | null = null
    private eventManager: EventManager
    private appSettings: AppSettings
    private readonly performanceMonitor: PerformanceMonitorUI

    constructor(
        config: PauseMenuConfig = {}, 
        callbacks: PauseMenuCallbacks = {}, 
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
        this.callbacks = callbacks
        this.systemDependencies = systemDependencies || null
        this.eventManager = eventManager
        this.appSettings = appSettings
        this.performanceMonitor = performanceMonitor    
    }

    init(): void {
        this.createMenuStructure()
        this.setupKeyboardHandling()
        this.setupEventListeners()
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(
            SteamEventTypes.DataLoaded, 
            this.onSteamDataLoaded.bind(this)
        )
    }

    private onSteamDataLoaded(event: CustomEvent<SteamDataLoadedEvent>): void {
        // Refresh cache management panel if it exists and is visible
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
        this.createPanelTab(panel)
    }

    registerDefaultPanels(): void {
        // Register cache management panel - no longer needs callbacks
        const cachePanel = new CacheManagementPanel()
        this.cacheManagementPanel = cachePanel
        this.registerPanel(cachePanel)
        
        // Register help panel
        this.registerPanel(new HelpPanel())
        
        // Register application panel
        const applicationPanel = new ApplicationPanel({}, this.appSettings, this.eventManager)
        applicationPanel.initialize({
            onSettingsChanged: (settings) => this.handleSettingsChange(settings)
        })
        this.applicationPanel = applicationPanel
        this.registerPanel(applicationPanel)
        
        // Register game settings panel
        this.registerPanel(new GameSettingsPanel({}, this.appSettings))
        
        // Register graphics settings panel
        const graphicsPanel = new GraphicsSettingsPanel({}, this.appSettings)
        graphicsPanel.initialize({
            onSettingsChanged: (settings) => this.handleSettingsChange(settings)
        })
        this.registerPanel(graphicsPanel)
        
        // Register camera settings panel
        const cameraPanel = new CameraSettingsPanel({}, this.appSettings)
        this.registerPanel(cameraPanel)
    
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
        
        // Pause input
        this.pauseInput()
        
        // Show overlay
        if (this.overlay) {
            this.overlay.style.display = 'flex'
        }

        // Show specific panel or first available
        const targetPanel = panelId || this.getFirstPanelId()
        if (targetPanel) {
            this.showPanel(targetPanel)
        }

        // Callbacks
        this.callbacks.onMenuOpen?.()
    }

    close(): void {
        if (!this.state.isOpen) return

        this.state.isOpen = false
        
        // Hide all panels
        this.hideAllPanels()
        
        // Hide overlay
        if (this.overlay) {
            this.overlay.style.display = 'none'
        }

        // Resume input
        this.resumeInput()
        
        // Restore focus
        if (this.state.previousFocus) {
            this.state.previousFocus.focus()
            this.state.previousFocus = null
        }

        // Callbacks
        this.callbacks.onMenuClose?.()
    }

    showPanel(panelId: string): void {
        // Hide current panel
        if (this.state.activePanel) {
            const currentPanel = this.panels.get(this.state.activePanel)
            currentPanel?.hide()
        }

        // Show new panel
        const panel = this.panels.get(panelId)
        if (panel) {
            panel.show()
            this.state.activePanel = panelId
            this.updateActiveTab(panelId)
        }
    }

    getState(): PauseMenuState {
        return { ...this.state }
    }

    isOpen(): boolean {
        return this.state.isOpen
    }

    private pauseInput(): void {
        if (!this.state.inputPaused) {
            this.state.inputPaused = true
            this.callbacks.onPauseInput?.()
        }
    }

    private resumeInput(): void {
        if (this.state.inputPaused) {
            this.state.inputPaused = false
            this.callbacks.onResumeInput?.()
        }
    }

    private createMenuStructure(): void {
        // Check if pause menu structure already exists
        const existingOverlay = document.getElementById(this.config.containerId)
        if (existingOverlay) {
            console.log('ðŸ”„ Found existing pause menu structure, reusing it')
            this.overlay = existingOverlay
            this.menuContainer = existingOverlay.querySelector(`.${this.config.menuClass}`)
            
            // Verify required elements exist, if not recreate them
            if (!this.menuContainer || !existingOverlay.querySelector('#pause-menu-tabs')) {
                console.log('âš ï¸ Existing structure incomplete, recreating...')
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
        const tabsContainer = document.getElementById('pause-menu-tabs')
        if (!tabsContainer) return

        // Mousewheel horizontal scrolling
        tabsContainer.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault()
                tabsContainer.scrollLeft += e.deltaY
            }
        }, { passive: false })

        // Touch horizontal scrolling (already handled by native touch events on overflow-x)
        // No additional code needed - CSS overflow-x: auto handles touch scrolling natively
    }

    private createPanelTab(panel: PauseMenuPanel): void {
        const tabsContainer = document.getElementById('pause-menu-tabs')
        if (!tabsContainer) {
            console.warn(`âš ï¸ Cannot create tab for panel '${panel.id}': tabs container not found`)
            return
        }

        // Check if tab already exists (prevent duplicates)
        const existingTab = document.getElementById(`tab-${panel.id}`)
        if (existingTab) {
            console.log(`ðŸ”„ Tab for panel '${panel.id}' already exists, skipping creation`)
            return
        }

        const tab = document.createElement('button')
        tab.id = `tab-${panel.id}`
        tab.className = 'pause-menu-tab'
        tab.innerHTML = `${panel.icon} ${panel.title}`
        
        tab.addEventListener('click', () => this.showPanel(panel.id))
        
        tabsContainer.appendChild(tab)
    }

    private updateActiveTab(panelId: string): void {
        // Remove active class from all tabs
        document.querySelectorAll('.pause-menu-tab').forEach(tab => {
            tab.classList.remove('active')
        })

        // Add active class to current tab
        const activeTab = document.getElementById(`tab-${panelId}`)
        if (activeTab) {
            activeTab.classList.add('active')
        }
    }

    private hideAllPanels(): void {
        this.panels.forEach(panel => panel.hide())
        this.state.activePanel = null
    }

    private getFirstPanelId(): string | undefined {
        return this.panels.keys().next().value
    }

    private setupKeyboardHandling(): void {
        document.addEventListener('keydown', (event) => {
            // Only handle escape if not in an input field
            if (event.key === 'Escape' && !this.isInputFocused()) {
                event.preventDefault()
                this.toggle()
            }
        })
    }

    private isInputFocused(): boolean {
        const activeElement = document.activeElement
        if (!activeElement) return false
        
        return activeElement.tagName === 'INPUT' ||
               activeElement.tagName === 'TEXTAREA' ||
               (activeElement as HTMLElement).contentEditable === 'true'
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

    private handleSettingsChange(settings: Partial<ApplicationSettings>): void {
        console.log('âš™ï¸ Settings changed:', settings)

        // Handle quality settings
        if (settings.qualityLevel !== undefined) {
            this.updateGraphicsQuality(settings.qualityLevel)
        }

        // Handle graphics settings
        if (settings.lightingQuality !== undefined || settings.shadowQuality !== undefined) {
            console.log('ðŸŽ¨ Graphics settings changed, applying lighting update...')
            // Emit lighting quality change event
            if (settings.lightingQuality !== undefined) {
                this.eventManager.emit(LightingEventTypes.QualityChanged, {
                    quality: settings.lightingQuality,
                    source: EventSource.UI
                })
            }
        }

        if (settings.ceilingHeight !== undefined) {
            console.log(`ðŸ“ Ceiling height changed to ${settings.ceilingHeight}m`)
            // Note: Environment changes require SceneCoordinator integration (handled in next step)
        }

        // Handle lighting toggles (these can be applied immediately)
        if (settings.enableLighting !== undefined) {
            console.log(`ðŸ’¡ Lighting ${settings.enableLighting ? 'enabled' : 'disabled'}`)
            this.eventManager.emit(LightingEventTypes.Toggle, { 
                enabled: settings.enableLighting 
            } as LightingToggleEvent)
        }

        if (settings.showLightingDebug !== undefined) {
            console.log(`ðŸ” Lighting debug ${settings.showLightingDebug ? 'enabled' : 'disabled'}`)
            this.eventManager.emit(LightingEventTypes.DebugToggle, { 
                enabled: settings.showLightingDebug 
            } as LightingDebugToggleEvent)
        }
    }

    // TODO: Quality enum
    private updateGraphicsQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
        if (!this.systemDependencies) {
            console.warn('âš ï¸ System dependencies not provided - cannot update graphics quality')
            return
        }

        const renderer = this.systemDependencies.renderer
        
        switch (quality) {
            case 'low':
                renderer.shadowMap.enabled = false
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
                break
            case 'medium':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
                break
            case 'high':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
                break
            case 'ultra':
                renderer.shadowMap.enabled = true
                renderer.setPixelRatio(window.devicePixelRatio)
                break
        }
    }
}
