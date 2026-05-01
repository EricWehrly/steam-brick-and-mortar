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
    
    protected storeInitialValue(controlId: string, value: string): void {
        this.initialValues.set(controlId, value)
    }

    protected updateChangedState(controlId: string, currentValue: string): void {
        const initial = this.initialValues.get(controlId)
        const changed = initial !== undefined && initial !== currentValue
        this.markControlChanged(controlId, changed)
    }

    protected clearAllChangedStates(): void {
        const controls = document.querySelectorAll('[data-changed]')
        controls.forEach(control => control.removeAttribute('data-changed'))
    }

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

    show(): void {
        if (!this.container) return

        this.isVisible = true
        const panelElement = document.getElementById(`panel-${this.id}`)
        if (panelElement) {
            panelElement.style.display = 'block'
            this.onShow()
        }
    }

    hide(): void {
        if (!this.container) return

        this.isVisible = false
        const panelElement = document.getElementById(`panel-${this.id}`)
        if (panelElement) {
            panelElement.style.display = 'none'
            this.onHide()
        }
    }

    getIsVisible(): boolean {
        return this.isVisible
    }

    private renderPanel(): void {
        if (!this.container) return

        const panelHtml = `
            <div id="panel-${this.id}" class="${this.config.className}" style="display: none;">
                <div class="panel-content">
                    ${this.render()}
                </div>
            </div>
        `

        this.container.insertAdjacentHTML('beforeend', panelHtml)
    }

    protected getPanelElement(): HTMLElement | null {
        return document.getElementById(`panel-${this.id}`)
    }

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

    dispose(): void {
        const panelElement = this.getPanelElement()
        if (panelElement) {
            panelElement.remove()
        }
        this.container = null
        this.isVisible = false
    }
}
