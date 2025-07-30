/**
 * PauseMenuManager - Main orchestrator for the pause menu system
 * 
 * Handles menu state, panel switching, and integration with input system
 */

import { PauseMenuPanel } from './PauseMenuPanel'
import { renderTemplate } from '../../utils/TemplateEngine'
import pauseMenuStructureTemplate from '../../templates/pause-menu/main-structure.html?raw'
import '../../styles/pause-menu/pause-menu-manager.css'

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

export class PauseMenuManager {
    private state: PauseMenuState = {
        isOpen: false,
        activePanel: null,
        inputPaused: false,
        previousFocus: null
    }

    private config: Required<PauseMenuConfig>
    private callbacks: PauseMenuCallbacks
    private panels: Map<string, PauseMenuPanel> = new Map()
    private overlay: HTMLElement | null = null
    private menuContainer: HTMLElement | null = null

    constructor(config: PauseMenuConfig = {}, callbacks: PauseMenuCallbacks = {}) {
        this.config = {
            containerId: 'pause-menu-overlay',
            overlayClass: 'pause-menu-overlay',
            menuClass: 'pause-menu',
            ...config
        }
        this.callbacks = callbacks
    }

    /**
     * Initialize the pause menu system
     */
    init(): void {
        this.createMenuStructure()
        this.setupKeyboardHandling()
        console.log('🎛️ Pause menu system initialized')
    }

    /**
     * Register a panel with the pause menu
     */
    registerPanel(panel: PauseMenuPanel): void {
        this.panels.set(panel.id, panel)
        panel.init()
        this.createPanelTab(panel)
        console.log(`📋 Registered pause menu panel: ${panel.title}`)
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
        
        console.log('⏸️ Pause menu opened')
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
        
        console.log('▶️ Pause menu closed')
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
        if (!tabsContainer) return

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

        // Dispose all panels
        this.panels.forEach(panel => panel.dispose())
        this.panels.clear()

        // Remove DOM elements
        if (this.overlay) {
            this.overlay.remove()
            this.overlay = null
        }

        // Remove styles
        const styles = document.getElementById('pause-menu-styles')
        if (styles) {
            styles.remove()
        }

        console.log('🗑️ Pause menu system disposed')
    }
}
