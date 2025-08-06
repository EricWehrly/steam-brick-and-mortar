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
    
    // Define logical keyboard navigation order (independent of visual tab order)
    private keyboardNavigationOrder: string[] = [
        'help',           // 1. Help (first - user orientation)
        'application',    // 2. Application (app-level settings)
        'cache-management', // 3. Cache (utility)
        'game-settings',  // 4. Game settings (primary user controls)
        'debug'           // 5. Debug (last - developer tools)
    ]

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
            
            // Set focus to the active tab for keyboard navigation
            setTimeout(() => {
                const activeTab = document.getElementById(`tab-${targetPanel}`)
                if (activeTab) {
                    activeTab.focus()
                }
            }, 0) // Delay to ensure DOM is ready
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
        
        // Accessibility attributes
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-controls', `panel-${panel.id}`)
        tab.setAttribute('aria-selected', 'false')
        tab.setAttribute('tabindex', '-1') // Will be set to 0 for active tab
        
        // Keyboard and mouse event handling
        tab.addEventListener('click', () => this.showPanel(panel.id))
        tab.addEventListener('keydown', (e) => this.handleTabKeydown(e, panel.id))
        
        tabsContainer.appendChild(tab)
        console.log(`📋 Created tab for panel: ${panel.title}`)
    }

    /**
     * Handle keyboard events on individual tabs
     */
    private handleTabKeydown(event: KeyboardEvent, panelId: string): void {
        switch (event.key) {
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault()
                this.navigateTabs(event.key === 'ArrowRight' ? 1 : -1)
                break
                
            case 'Enter':
            case ' ':
                event.preventDefault()
                this.showPanel(panelId)
                break
                
            case 'Home':
                event.preventDefault()
                this.activatePanelByIndex(0)
                break
                
            case 'End': {
                event.preventDefault()
                this.activatePanelByIndex(this.keyboardNavigationOrder.length - 1)
                break
            }
        }
    }

    /**
     * Update the active tab styling and accessibility attributes
     */
    private updateActiveTab(panelId: string): void {
        // Remove active class and update accessibility for all tabs
        document.querySelectorAll('.pause-menu-tab').forEach(tab => {
            tab.classList.remove('active')
            tab.setAttribute('aria-selected', 'false')
            tab.setAttribute('tabindex', '-1')
        })

        // Add active class and update accessibility for current tab
        const activeTab = document.getElementById(`tab-${panelId}`)
        if (activeTab) {
            activeTab.classList.add('active')
            activeTab.setAttribute('aria-selected', 'true')
            activeTab.setAttribute('tabindex', '0')
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
            // Only handle pause menu shortcuts when menu is open
            if (this.state.isOpen) {
                this.handleMenuKeyboard(event)
            } else {
                // Global shortcuts when menu is closed
                this.handleGlobalKeyboard(event)
            }
        })
    }

    /**
     * Handle keyboard events when menu is open
     */
    private handleMenuKeyboard(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Escape':
                if (!this.isInputFocused()) {
                    event.preventDefault()
                    this.close()
                }
                break

            case 'Tab':
                // Let browser handle tab naturally for form controls within panels
                // This ensures proper accessibility for inputs, buttons, etc.
                break

            case 'ArrowLeft':
            case 'ArrowRight':
                // Arrow keys for tab navigation
                if (!this.isInputFocused()) {
                    event.preventDefault()
                    this.navigateTabs(event.key === 'ArrowRight' ? 1 : -1)
                }
                break

            case 'ArrowUp':
            case 'ArrowDown':
                // Optional: Arrow up/down for tab navigation (alternative to left/right)
                if (!this.isInputFocused() && event.ctrlKey) {
                    event.preventDefault()
                    this.navigateTabs(event.key === 'ArrowDown' ? 1 : -1)
                }
                break

            case 'Enter':
            case ' ':
                // Activate focused tab
                if (document.activeElement?.classList.contains('pause-menu-tab')) {
                    event.preventDefault()
                    ;(document.activeElement as HTMLElement).click()
                }
                break

            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
                // Number key shortcuts for direct panel access
                if (!this.isInputFocused() && event.altKey) {
                    event.preventDefault()
                    const panelIndex = parseInt(event.key) - 1
                    this.activatePanelByIndex(panelIndex)
                }
                break
        }
    }

    /**
     * Handle global keyboard shortcuts when menu is closed
     */
    private handleGlobalKeyboard(event: KeyboardEvent): void {
        switch (event.key) {
            case 'Escape':
                if (!this.isInputFocused()) {
                    event.preventDefault()
                    this.open()
                }
                break
        }
    }

    /**
     * Navigate between tabs using keyboard in logical order
     */
    private navigateTabs(direction: number): void {
        // Get current active panel ID
        const currentPanelId = this.state.activePanel
        if (!currentPanelId) return

        // Find current position in logical navigation order
        const currentIndex = this.keyboardNavigationOrder.indexOf(currentPanelId)
        if (currentIndex === -1) return

        // Calculate new index with wrapping
        const newIndex = (currentIndex + direction + this.keyboardNavigationOrder.length) % this.keyboardNavigationOrder.length
        const newPanelId = this.keyboardNavigationOrder[newIndex]

        // Switch to the new panel
        this.showPanel(newPanelId)
        
        // Focus the tab for keyboard navigation visibility
        const newTab = document.getElementById(`tab-${newPanelId}`)
        if (newTab) {
            newTab.focus()
        }
    }

    /**
     * Activate panel by numeric index (for Alt+Number shortcuts) using logical order
     */
    private activatePanelByIndex(index: number): void {
        if (index >= 0 && index < this.keyboardNavigationOrder.length) {
            const panelId = this.keyboardNavigationOrder[index]
            this.showPanel(panelId)
            
            const tab = document.getElementById(`tab-${panelId}`)
            if (tab) {
                tab.focus()
            }
        }
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

        console.log('🗑️ Pause menu system disposed')
    }
}
