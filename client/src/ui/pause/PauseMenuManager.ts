/**
 * PauseMenuManager - Main orchestrator for the pause menu system
 * 
 * Handles menu state, panel switching, and integration with input system
 */

import { PauseMenuPanel } from './PauseMenuPanel'

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
        this.addStyles()
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
        this.menuContainer.innerHTML = `
            <div class="pause-menu-header">
                <h2>⏸️ Pause Menu</h2>
                <button class="close-btn" id="pause-menu-close">✕</button>
            </div>
            <div class="pause-menu-tabs" id="pause-menu-tabs">
                <!-- Panel tabs will be added here -->
            </div>
            <div class="pause-menu-content" id="pause-menu-content">
                <!-- Panel content will be added here -->
            </div>
        `

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
     * Add CSS styles for the pause menu
     */
    private addStyles(): void {
        const style = document.createElement('style')
        style.id = 'pause-menu-styles'
        style.textContent = `
            .pause-menu-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(5px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .pause-menu {
                background: #1a1a1a;
                border: 1px solid #444;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                max-width: 800px;
                width: 90vw;
                max-height: 85vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }

            .pause-menu-header {
                padding: 8px 15px;
                border-bottom: 1px solid #333;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #222;
            }

            .pause-menu-header h2 {
                margin: 0;
                color: #00aaff;
                font-size: 16px;
            }

            .close-btn {
                background: #444;
                border: none;
                color: #fff;
                width: 26px;
                height: 26px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .close-btn:hover {
                background: #666;
            }

            .pause-menu-tabs {
                display: flex;
                background: #2a2a2a;
                border-bottom: 1px solid #333;
                overflow-x: auto;
                min-height: 44px;
            }

            .pause-menu-tab {
                background: none;
                border: none;
                color: #ccc;
                padding: 12px 18px;
                cursor: pointer;
                font-size: 14px;
                white-space: nowrap;
                border-bottom: 2px solid transparent;
                transition: all 0.2s ease;
                min-height: 44px;
                display: flex;
                align-items: center;
            }

            .pause-menu-tab:hover {
                background: #333;
                color: #fff;
            }

            .pause-menu-tab.active {
                color: #00aaff;
                border-bottom-color: #00aaff;
                background: #333;
            }

            .pause-menu-content {
                flex: 1;
                overflow-y: auto;
                padding: 0;
            }

            .pause-menu-panel {
                display: none;
                height: 100%;
            }

            .panel-content {
                padding: 15px;
                color: #ccc;
                min-height: 200px;
            }
        `

        // Only add if not already present
        if (!document.getElementById('pause-menu-styles')) {
            document.head.appendChild(style)
        }
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
