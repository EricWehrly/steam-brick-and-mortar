/**
 * Base class for extensible pause menu panels
 * Provides common functionality and interface for all menu panels
 */

export interface PauseMenuPanelConfig {
    containerId?: string
    className?: string
}

export abstract class PauseMenuPanel {
    protected container: HTMLElement | null = null
    protected config: PauseMenuPanelConfig
    protected isVisible: boolean = false

    constructor(config: PauseMenuPanelConfig = {}) {
        this.config = {
            containerId: 'pause-menu-content',
            className: 'pause-menu-panel',
            ...config
        }
    }

    // Abstract methods that each panel must implement
    abstract readonly id: string
    abstract readonly title: string
    abstract readonly icon: string
    
    abstract render(): string
    abstract attachEvents(): void
    abstract onShow(): void
    abstract onHide(): void

    /**
     * Initialize the panel within the specified container
     */
    init(): void {
        const containerId = this.config.containerId
        if (!containerId) {
            console.warn('PauseMenuPanel: No container ID specified')
            return
        }

        this.container = document.getElementById(containerId)
        if (!this.container) {
            console.warn(`PauseMenuPanel: Container ${containerId} not found`)
            return
        }

        this.renderPanel()
        this.attachEvents()
    }

    /**
     * Show this panel (hide others, show this one)
     */
    show(): void {
        if (!this.container) return

        this.isVisible = true
        const panelElement = document.getElementById(`panel-${this.id}`)
        if (panelElement) {
            panelElement.style.display = 'block'
            this.onShow()
        }
    }

    /**
     * Hide this panel
     */
    hide(): void {
        if (!this.container) return

        this.isVisible = false
        const panelElement = document.getElementById(`panel-${this.id}`)
        if (panelElement) {
            panelElement.style.display = 'none'
            this.onHide()
        }
    }

    /**
     * Check if panel is currently visible
     */
    getIsVisible(): boolean {
        return this.isVisible
    }

    /**
     * Render the panel HTML structure
     */
    private renderPanel(): void {
        if (!this.container) return

        const panelHtml = `
            <div id="panel-${this.id}" 
                 class="${this.config.className}" 
                 role="tabpanel" 
                 aria-labelledby="tab-${this.id}"
                 style="display: none;">
                <div class="panel-header">
                    <h3>${this.icon} ${this.title}</h3>
                </div>
                <div class="panel-content">
                    ${this.render()}
                </div>
            </div>
        `

        this.container.insertAdjacentHTML('beforeend', panelHtml)
    }

    /**
     * Get panel DOM element
     */
    protected getPanelElement(): HTMLElement | null {
        return document.getElementById(`panel-${this.id}`)
    }

    /**
     * Add event listener helper with automatic cleanup tracking
     */
    protected addEventListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement | null,
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (element) {
            element.addEventListener(type, listener, options)
            // Store for cleanup if needed
        }
    }

    /**
     * Clean up resources and remove event listeners
     */
    dispose(): void {
        const panelElement = this.getPanelElement()
        if (panelElement) {
            panelElement.remove()
        }
        this.container = null
        this.isVisible = false
    }
}
