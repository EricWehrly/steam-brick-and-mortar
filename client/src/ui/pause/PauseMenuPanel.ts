/**
 * Base class for extensible pause menu panels
 * Provides common functionality and interface for all menu panels
 */

export interface PauseMenuPanelConfig {
    containerId?: string
    className?: string
}

/**
 * RELOAD INDICATOR SYSTEM
 * 
 * Uses two data attributes for pure CSS control:
 * - data-requires-reload: Static, declared in HTML on controls that need reload
 * - data-changed: Dynamic, set by JS when value differs from initial
 * 
 * CSS :has() selectors cascade the indicator up through sections and tabs.
 * 
 * TODO: The reload requirement could be removed by implementing hot-reload
 * of LOD configs and ceiling geometry. See GpuGameBoxRenderer.buildLodConfigsFromSettings()
 */

export abstract class PauseMenuPanel {
    protected container: HTMLElement | null = null
    protected config: PauseMenuPanelConfig
    protected isVisible: boolean = false
    
    /** Store initial values to detect changes */
    protected initialValues: Map<string, string> = new Map()

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
     * Mark a control as changed or unchanged.
     * Sets data-changed attribute which CSS uses with data-requires-reload
     * to show reload indicators via :has() selectors.
     */
    protected markControlChanged(controlId: string, changed: boolean): void {
        const control = document.getElementById(controlId)
        if (control) {
            if (changed) {
                control.setAttribute('data-changed', '')
            } else {
                control.removeAttribute('data-changed')
            }
        }
    }
    
    /**
     * Store initial value for a control to detect changes later.
     */
    protected storeInitialValue(controlId: string, value: string): void {
        this.initialValues.set(controlId, value)
    }
    
    /**
     * Check if control value has changed from initial and update data-changed attribute.
     * Call this when a setting changes.
     */
    protected updateChangedState(controlId: string, currentValue: string): void {
        const initial = this.initialValues.get(controlId)
        const changed = initial !== undefined && initial !== currentValue
        this.markControlChanged(controlId, changed)
    }
    
    /**
     * Clear all data-changed attributes (e.g., on panel show or after reload).
     */
    protected clearAllChangedStates(): void {
        const controls = document.querySelectorAll('[data-changed]')
        controls.forEach(control => control.removeAttribute('data-changed'))
    }

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
        this.attachChangeTracking()
    }
    
    /**
     * Attach generic change tracking to all inputs/selects in this panel.
     * When any control changes, automatically:
     * 1. Store initial value if not yet stored
     * 2. Compare to initial and set/remove data-changed attribute
     */
    private attachChangeTracking(): void {
        const panel = this.getPanelElement()
        if (!panel) return
        
        const handleChange = (e: Event) => {
            const target = e.target as HTMLInputElement | HTMLSelectElement
            if (!target?.id) return
            
            const controlId = target.id
            const currentValue = target.value
            
            this.updateChangedState(controlId, currentValue)
        }
        
        // Listen on panel for bubbled events (more efficient than per-element)
        panel.addEventListener('input', handleChange)
        panel.addEventListener('change', handleChange)
    }
    
    /**
     * Store initial values for all inputs/selects in the panel.
     * Called on show to establish baseline for change detection.
     */
    protected storeAllInitialValues(): void {
        const panel = this.getPanelElement()
        if (!panel) return
        
        const controls = panel.querySelectorAll('input, select')
        controls.forEach(control => {
            const el = control as HTMLInputElement | HTMLSelectElement
            if (el.id) {
                this.initialValues.set(el.id, el.value)
            }
        })
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
            <div id="panel-${this.id}" class="${this.config.className}" style="display: none;">
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
