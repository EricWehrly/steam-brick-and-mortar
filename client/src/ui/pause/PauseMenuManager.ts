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
import { CacheManagementPanel, type CachedUser } from './panels/CacheManagementPanel'
import { HelpPanel } from './panels/HelpPanel'
import { ApplicationPanel } from './panels/ApplicationPanel'
import { GameSettingsPanel } from './panels/GameSettingsPanel'
import { DebugPanel } from './panels/DebugPanel'
import type { DebugStats } from '../../core'
import type { ImageCacheStats } from '../../steam/images/ImageManager'
import type { PerformanceMonitor } from '../PerformanceMonitor'
import { EventManager } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'
import type { SteamDataLoadedEvent } from '../../types/InteractionEvents'
import type { ApplicationSettings } from '../../core/AppSettings'

export interface PauseMenuState {
    isOpen: boolean
    activePanel: string | null
    inputPaused: boolean
    previousFocus: HTMLElement | null
}

export interface PauseMenuConfig {
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
    performanceMonitor: PerformanceMonitor
    renderer: THREE.WebGLRenderer
}

export interface DefaultPanelCallbacks {
    // Cache management
    onGetImageCacheStats?: () => Promise<ImageCacheStats>
    onClearImageCache?: () => Promise<void>
    onGetCachedUsers?: () => Promise<CachedUser[]>
    onLoadCachedUser?: (steamId: string) => Promise<void>
    onGetImageUrls?: () => Promise<string[]>
    onGetCachedBlob?: (url: string) => Promise<Blob | null>
    
    // Debug stats
    onGetDebugStats?: () => Promise<DebugStats>
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

    constructor(config: PauseMenuConfig = {}, callbacks: PauseMenuCallbacks = {}, systemDependencies?: SystemDependencies) {
        this.config = {
            containerId: 'pause-menu-overlay',
            overlayClass: 'pause-menu-overlay',
            menuClass: 'pause-menu',
            ...config
        }
        this.callbacks = callbacks
        this.systemDependencies = systemDependencies || null
        this.eventManager = EventManager.getInstance()
    }

    /**
     * Initialize the pause menu system
     */
    init(): void {
        this.createMenuStructure()
        this.setupKeyboardHandling()
        this.setupEventListeners()
    }

    /**
     * Setup event listeners for steam data loading
     */
    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(
            SteamEventTypes.DataLoaded, 
            this.onSteamDataLoaded.bind(this)
        )
    }

    /**
     * Handle steam data loaded event - refresh panels that depend on data
     */
    private onSteamDataLoaded(event: CustomEvent<SteamDataLoadedEvent>): void {
        // Refresh cache management panel if it exists and is visible
        if (this.cacheManagementPanel) {
            this.cacheManagementPanel.refreshTemplate()
        }
    }

    /**
     * Set system dependencies for settings management
     */
    setSystemDependencies(dependencies: SystemDependencies): void {
        this.systemDependencies = dependencies
    }

    /**
     * Register a panel with the pause menu
     */
    registerPanel(panel: PauseMenuPanel): void {
        this.panels.set(panel.id, panel)
        panel.init()
        this.createPanelTab(panel)
    }

    /**
     * Register all default panels with their callbacks
     */
    registerDefaultPanels(callbacks: DefaultPanelCallbacks): void {
        // Register cache management panel
        if (callbacks.onGetImageCacheStats && callbacks.onClearImageCache) {
            const cachePanel = new CacheManagementPanel()
            cachePanel.initCacheFunctions(
                callbacks.onGetImageCacheStats,
                callbacks.onClearImageCache,
                callbacks.onGetCachedUsers,
                callbacks.onLoadCachedUser,
                callbacks.onGetImageUrls,
                callbacks.onGetCachedBlob
            )
            this.cacheManagementPanel = cachePanel
            this.registerPanel(cachePanel)
        }
        
        // Register help panel
        this.registerPanel(new HelpPanel())
        
        // Register application panel
        const applicationPanel = new ApplicationPanel()
        applicationPanel.initialize({
            onSettingsChanged: (settings) => this.handleSettingsChange(settings)
        })
        this.applicationPanel = applicationPanel
        this.registerPanel(applicationPanel)
        
        // Register game settings panel
        this.registerPanel(new GameSettingsPanel())
        
        // Register debug panel
        if (callbacks.onGetDebugStats) {
            const debugPanel = new DebugPanel()
            debugPanel.initialize({
                onGetDebugStats: callbacks.onGetDebugStats
            })
            this.registerPanel(debugPanel)
        }
    }

    /**
     * Get the cache management panel for external access
     */
    getCacheManagementPanel(): CacheManagementPanel | null {
        return this.cacheManagementPanel
    }

    /**
     * Get the application panel for external access
     */
    getApplicationPanel(): ApplicationPanel | null {
        return this.applicationPanel
    }

    /**
     * Toggle the pause menu open/closed
     */
    toggle(): void {
        if (this.state.isOpen) {
            this.close()
        } else {
            this.open()
        }
    }

    /**
     * Open the pause menu
     */
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

    /**
     * Close the pause menu
     */
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

    /**
     * Show a specific panel by ID
     */
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

    /**
     * Get current menu state
     */
    getState(): PauseMenuState {
        return { ...this.state }
    }

    /**
     * Check if menu is open
     */
    isOpen(): boolean {
        return this.state.isOpen
    }

    /**
     * Pause input handling
     */
    private pauseInput(): void {
        if (!this.state.inputPaused) {
            this.state.inputPaused = true
            this.callbacks.onPauseInput?.()
        }
    }

    /**
     * Resume input handling
     */
    private resumeInput(): void {
        if (this.state.inputPaused) {
            this.state.inputPaused = false
            this.callbacks.onResumeInput?.()
        }
    }

    /**
     * Create the HTML structure for the pause menu
     */
    private createMenuStructure(): void {
        // Check if pause menu structure already exists
        const existingOverlay = document.getElementById(this.config.containerId)
        if (existingOverlay) {
            console.log('🔄 Found existing pause menu structure, reusing it')
            this.overlay = existingOverlay
            this.menuContainer = existingOverlay.querySelector(`.${this.config.menuClass}`)
            
            // Verify required elements exist, if not recreate them
            if (!this.menuContainer || !existingOverlay.querySelector('#pause-menu-tabs')) {
                console.log('⚠️ Existing structure incomplete, recreating...')
                existingOverlay.remove()
                this.createNewMenuStructure()
            } else {
                // Setup event handlers for existing structure
                this.setupEventHandlers()
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
        this.menuContainer.innerHTML = renderTemplate(pauseMenuStructureTemplate, {})

        this.overlay.appendChild(this.menuContainer)
        document.body.appendChild(this.overlay)

        this.setupEventHandlers()
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

    /**
     * Create a tab for a panel in the menu
     */
    private createPanelTab(panel: PauseMenuPanel): void {
        const tabsContainer = document.getElementById('pause-menu-tabs')
        if (!tabsContainer) {
            console.warn(`⚠️ Cannot create tab for panel '${panel.id}': tabs container not found`)
            return
        }

        // Check if tab already exists (prevent duplicates)
        const existingTab = document.getElementById(`tab-${panel.id}`)
        if (existingTab) {
            console.log(`🔄 Tab for panel '${panel.id}' already exists, skipping creation`)
            return
        }

        const tab = document.createElement('button')
        tab.id = `tab-${panel.id}`
        tab.className = 'pause-menu-tab'
        tab.innerHTML = `${panel.icon} ${panel.title}`
        
        tab.addEventListener('click', () => this.showPanel(panel.id))
        
        tabsContainer.appendChild(tab)
    }

    /**
     * Update the active tab styling
     */
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

    /**
     * Hide all panels
     */
    private hideAllPanels(): void {
        this.panels.forEach(panel => panel.hide())
        this.state.activePanel = null
    }

    /**
     * Get the first panel ID for default display
     */
    private getFirstPanelId(): string | undefined {
        return this.panels.keys().next().value
    }

    /**
     * Setup keyboard event handling for the pause menu
     */
    private setupKeyboardHandling(): void {
        document.addEventListener('keydown', (event) => {
            // Only handle escape if not in an input field
            if (event.key === 'Escape' && !this.isInputFocused()) {
                event.preventDefault()
                this.toggle()
            }
        })
    }

    /**
     * Check if an input element is currently focused
     */
    private isInputFocused(): boolean {
        const activeElement = document.activeElement
        if (!activeElement) return false
        
        return activeElement.tagName === 'INPUT' ||
               activeElement.tagName === 'TEXTAREA' ||
               (activeElement as HTMLElement).contentEditable === 'true'
    }

    /**
     * Clean up resources
     */
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

    /**
     * Handle application settings changes
     */
    private handleSettingsChange(settings: Partial<ApplicationSettings>): void {
        if (!this.systemDependencies) {
            console.warn('⚠️ System dependencies not provided - cannot apply settings changes')
            return
        }
        
        // Handle performance settings
        if (settings.showFPS !== undefined) {
            // Toggle FPS display based on setting
            if (settings.showFPS) {
                this.systemDependencies.performanceMonitor.show()
            } else {
                this.systemDependencies.performanceMonitor.hide()
            }
        }
        
        if (settings.showPerformanceStats !== undefined) {
            // Toggle performance stats visibility
            if (settings.showPerformanceStats) {
                this.systemDependencies.performanceMonitor.show()
            } else {
                this.systemDependencies.performanceMonitor.hide()
            }
        }
        
        if (settings.qualityLevel !== undefined) {
            this.updateGraphicsQuality(settings.qualityLevel)
        }
    }

    /**
     * Update graphics quality based on setting
     */
    private updateGraphicsQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
        if (!this.systemDependencies) {
            console.warn('⚠️ System dependencies not provided - cannot update graphics quality')
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
