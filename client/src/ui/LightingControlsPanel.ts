/**
 * Lighting Controls Panel - Real-time lighting control interface
 * 
 * Provides granular control over individual lights and light groups:
 * - Toggle individual lights on/off
 * - Group lights by type (RectAreaLight, SpotLight, etc.)
 * - Master controls for entire light types
 * - Real-time updates with scene integration
 * 
 * Uses LightRegistry for O(1) lookups instead of scene traversal.
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../core/EventManager'
import { LightingEventTypes, type LightCreatedEvent, type LightingSystemReadyEvent } from '../types/InteractionEvents'
import { AppSettings } from '../core/AppSettings'
import { LightRegistry } from '../lighting/LightRegistry'
import { Logger } from '../utils/Logger'
import '../styles/lighting-controls-panel.css'

interface LightGroupInfo {
    type: string
    lights: THREE.Light[]
    enabled: boolean
    collapsed: boolean
}

export class LightingControlsPanel {
    public static logger = Logger.createLogFunctions(LightingControlsPanel.name)
    private container: HTMLElement
    private scene: THREE.Scene | null = null
    private lightGroups: Map<string, LightGroupInfo> = new Map()
    private eventManager: EventManager
    private lightCreatedHandler: (event: CustomEvent<LightCreatedEvent>) => void
    private lightingSystemReadyHandler: (event: CustomEvent<LightingSystemReadyEvent>) => void

    private appSettings: AppSettings
    private debugIndicatorEnabled: boolean
    private panelCollapsed: boolean = true
    private horizontallyCollapsed: boolean = true
    private checkboxUpdatePending: number | null = null
    
    // Use central registry for light and debug helper lookups
    private registry: LightRegistry

    constructor(eventManager: EventManager, appSettings: AppSettings) {
        this.eventManager = eventManager
        this.registry = LightRegistry.getInstance()
        this.lightCreatedHandler = this.onLightCreated.bind(this)
        this.lightingSystemReadyHandler = this.onLightingSystemReady.bind(this)
        this.appSettings = appSettings
        this.debugIndicatorEnabled = this.appSettings.getSetting('showLightingDebug') ?? false
        this.panelCollapsed = true
        this.horizontallyCollapsed = true
        this.container = this.createPanel()
        this.setupEventListeners()
        // No initial scan - we'll scan when we get the first light event or system ready event
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement('div')
        panel.id = 'lighting-controls-panel'
        panel.className = 'lighting-controls-panel horizontally-collapsed'
        panel.innerHTML = `
            <div class="panel-header clickable-header" id="lighting-panel-header">
                <h3><span class="panel-icon">💡</span><span class="panel-title"> Lighting Controls</span></h3>
                <div class="header-controls">
                    <button class="refresh-button" id="refresh-lights">🔄</button>
                    <span class="toggle-indicator" id="toggle-indicator">▶</span>
                </div>
            </div>
            <div class="panel-content collapsed" id="lighting-panel-content">
                <div class="master-controls">
                    <label class="control-item">
                        <input type="checkbox" id="all-lights-toggle">
                        <span class="control-label">All Lights</span>
                    </label>
                    <label class="control-item">
                        <input type="checkbox" id="debug-indicator-toggle" ${this.debugIndicatorEnabled ? 'checked' : ''}>
                        <span class="control-label">Show Debug Indicators</span>
                    </label>
                </div>
                <div class="light-groups" id="light-groups-container">
                    <!-- Light groups with nested individual lights will be populated here -->
                </div>
            </div>
        `

        // Hide the separate lighting controls button since we're integrating it into the panel
        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'none'
        }

        // Styles are now loaded from external CSS file

        const slot = document.getElementById('ui-slot-top-right')
        if (slot) {
            slot.appendChild(panel)
        } else {
            document.body.appendChild(panel)
        }
        this.attachEventHandlers()
        return panel
    }

    private attachEventHandlers(): void {
        // Header click to toggle panel
        const panelHeader = document.getElementById('lighting-panel-header')
        if (panelHeader) {
            panelHeader.addEventListener('click', (e) => {
                // Don't toggle if clicking on the refresh button
                if ((e.target as HTMLElement).classList.contains('refresh-button')) {
                    return
                }
                this.togglePanelContent()
            })
        }

        // Master toggle
        const allLightsToggle = document.getElementById('all-lights-toggle') as HTMLInputElement
        if (allLightsToggle) {
            allLightsToggle.addEventListener('change', () => {
                this.toggleAllLights(allLightsToggle.checked)
            })
        }

        // Debug indicator toggle
        const debugToggle = document.getElementById('debug-indicator-toggle') as HTMLInputElement
        if (debugToggle) {
            debugToggle.checked = this.debugIndicatorEnabled
            debugToggle.addEventListener('change', () => {
                this.debugIndicatorEnabled = debugToggle.checked
                this.appSettings.setSetting('showLightingDebug', this.debugIndicatorEnabled, EventSource.UI)
                this.toggleAllDebugHelpers(this.debugIndicatorEnabled)
            })
        }

        // Refresh button
        const refreshButton = document.getElementById('refresh-lights')
        if (refreshButton) {
            refreshButton.addEventListener('click', (e) => {
                e.stopPropagation() // Prevent header click from triggering
                this.scanLights()
                this.updateUI()
            })
        }
    }

    private setupEventListeners(): void {
        // Listen for light creation events
        this.eventManager.registerEventHandler(LightingEventTypes.Created, this.lightCreatedHandler)
        // Listen for lighting system ready events
        this.eventManager.registerEventHandler(LightingEventTypes.SystemReady, this.lightingSystemReadyHandler)
    }

    private onLightCreated(event: CustomEvent<LightCreatedEvent>): void {
        LightingControlsPanel.logger.debug(`💡 Light created: ${event.detail.lightType} (${event.detail.lightName || 'unnamed'})`)
        
        // Get scene from the first light event
        if (!this.scene) {
            this.scene = event.detail.scene
            this.performInitialScan() // Now we can scan for existing lights
        }
        
        this.addLightToGroups(event.detail.light, event.detail.lightType)
        this.updateUI()
    }

    private onLightingSystemReady(event: CustomEvent<LightingSystemReadyEvent>): void {
        LightingControlsPanel.logger.debug(`💡 Lighting system ready: ${event.detail.quality} quality`)
        
        // Get scene from the system ready event if we don't have it yet
        if (!this.scene) {
            this.scene = event.detail.scene
            this.performInitialScan() // Now we can scan for existing lights
        }
        
        // Always refresh UI when system is ready (covers initial load and quality changes)
        this.scanLights()
        this.updateUI()
    }

    private addLightToGroups(light: THREE.Light, lightType: string): void {
        if (!this.lightGroups.has(lightType)) {
            this.lightGroups.set(lightType, {
                type: lightType,
                lights: [],
                enabled: light.visible, // Initialize based on first light's actual visibility
                collapsed: true // Start collapsed
            })
        }
        
        const group = this.lightGroups.get(lightType)!
        group.lights.push(light)
        
        // Recalculate group enabled state: true if ANY light in group is visible
        const enabledCount = group.lights.filter(l => l.visible).length
        group.enabled = enabledCount > 0
    }

    private performInitialScan(): void {
        // Initial scan to catch any existing lights
        this.scanLights()
        this.updateUI()
        // Force immediate checkbox update on initial load (don't defer)
        this.doUpdateCheckboxStates()
    }



    private scanLights(): void {
        const newGroups = new Map<string, LightGroupInfo>()

        // Use registry for O(1) grouped lookup instead of scene traversal
        const groupedLights = this.registry.getLightsGroupedByType()
        
        for (const [lightType, lights] of groupedLights) {
            newGroups.set(lightType, {
                type: lightType,
                lights: [...lights], // Copy array
                enabled: true,
                collapsed: true // Start collapsed
            })
        }

        // Update enabled states based on current visibility
        newGroups.forEach((group) => {
            const enabledCount = group.lights.filter(light => light.visible).length
            group.enabled = enabledCount > 0
        })

        this.lightGroups = newGroups
    }

    private updateUI(): void {
        this.updateLightGroups()
        this.updateIndividualLights()
        this.updateMasterToggle()
    }

    private updateLightGroups(): void {
        const container = document.getElementById('light-groups-container')
        if (!container) return

        container.innerHTML = ''

        this.lightGroups.forEach((group, type) => {
            const groupElement = document.createElement('div')
            groupElement.className = 'light-group'
            
            // Create group header with separate click regions
            const groupHeader = document.createElement('div')
            groupHeader.className = 'group-header'
            
            // Checkbox area (label + checkbox)
            const checkboxArea = document.createElement('div')
            checkboxArea.className = 'group-checkbox-area'
            checkboxArea.innerHTML = `
                <input type="checkbox" class="group-toggle" data-type="${type}" ${group.enabled ? 'checked' : ''}>
                <span class="control-label">${type} (${group.lights.length})</span>
            `
            
            // Expander arrow
            const expander = document.createElement('span')
            expander.className = `group-expander${group.collapsed ? ' collapsed' : ''}`
            expander.textContent = '▼'
            expander.dataset.type = type
            
            groupHeader.appendChild(checkboxArea)
            groupHeader.appendChild(expander)
            groupElement.appendChild(groupHeader)
            
            // Create lights container
            const lightsContainer = document.createElement('div')
            lightsContainer.className = `group-lights-container${group.collapsed ? ' collapsed' : ''}`
            lightsContainer.dataset.type = type
            
            // Add individual lights to this group
            group.lights.forEach((light, index) => {
                const lightElement = document.createElement('div')
                lightElement.className = 'individual-light'
                
                const lightName = light.name || `${type}-${index}`
                lightElement.innerHTML = `
                    <label class="control-item light-control">
                        <input type="checkbox" class="light-toggle" data-light-id="${light.id}" ${light.visible ? 'checked' : ''}>
                        <span class="control-label">${lightName}</span>
                        <span class="light-info">${this.getLightInfo(light)}</span>
                    </label>
                `
                
                const lightCheckbox = lightElement.querySelector('.light-toggle') as HTMLInputElement
                lightCheckbox.addEventListener('change', () => {
                    this.toggleIndividualLight(light, lightCheckbox.checked)
                })
                
                lightsContainer.appendChild(lightElement)
            })
            
            groupElement.appendChild(lightsContainer)
            
            // Event listeners
            const checkbox = checkboxArea.querySelector('.group-toggle') as HTMLInputElement
            checkboxArea.addEventListener('click', (e) => {
                // Only toggle checkbox if clicking the area, not the checkbox itself
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked
                    this.toggleLightGroup(type, checkbox.checked)
                }
            })
            
            checkbox.addEventListener('change', () => {
                this.toggleLightGroup(type, checkbox.checked)
            })
            
            expander.addEventListener('click', () => {
                this.toggleGroupExpansion(type)
            })

            container.appendChild(groupElement)
        })
    }

    private updateIndividualLights(): void {
        // Individual lights are now nested within their groups
        // This method is kept for backwards compatibility but does nothing
        // The lights are rendered in updateLightGroups()
    }

    private updateMasterToggle(): void {
        const masterToggle = document.getElementById('all-lights-toggle') as HTMLInputElement
        if (!masterToggle) return

        const allLights = Array.from(this.lightGroups.values()).flatMap(group => group.lights)
        const enabledLights = allLights.filter(light => light.visible)
        
        masterToggle.checked = enabledLights.length === allLights.length
        masterToggle.indeterminate = enabledLights.length > 0 && enabledLights.length < allLights.length
    }

    /**
     * Schedule deferred checkbox update to avoid redundant work during rapid toggles
     * Coalesces multiple update requests into a single execution
     */
    private updateCheckboxStates(): void {
        // Cancel pending update if exists
        if (this.checkboxUpdatePending !== null) {
            cancelAnimationFrame(this.checkboxUpdatePending)
        }
        
        // Schedule update for next animation frame (deferred execution)
        this.checkboxUpdatePending = requestAnimationFrame(this.doUpdateCheckboxStates.bind(this))
    }

    /**
     * Actually update checkbox states without rebuilding DOM (fast)
     * Called via deferred execution to avoid redundant work
     */
    private doUpdateCheckboxStates(): void {
        // Clear pending flag first
        this.checkboxUpdatePending = null
        
        // Update master toggle
        this.updateMasterToggle()
        
        // Update group checkboxes
        this.lightGroups.forEach((group, type) => {
            const checkbox = document.querySelector(`.group-toggle[data-type="${type}"]`) as HTMLInputElement
            if (checkbox) {
                const enabledCount = group.lights.filter(light => light.visible).length
                checkbox.checked = enabledCount > 0
                checkbox.indeterminate = enabledCount > 0 && enabledCount < group.lights.length
            }
        })
        
        // Update individual light checkboxes
        this.lightGroups.forEach((group) => {
            group.lights.forEach(light => {
                const checkbox = document.querySelector(`.light-toggle[data-light-id="${light.id}"]`) as HTMLInputElement
                if (checkbox) {
                    checkbox.checked = light.visible
                }
            })
        })
    }

    private getLightInfo(light: THREE.Light): string {
        const info: string[] = []
        
        if ('intensity' in light) {
            info.push(`I:${light.intensity.toFixed(1)}`)
        }
        
        if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
            info.push(`D:${light.distance}`)
        }
        
        if (light instanceof THREE.RectAreaLight) {
            info.push(`${light.width}×${light.height}`)
        }

        return info.length > 0 ? `(${info.join(', ')})` : ''
    }

    private toggleAllLights(enabled: boolean): void {
        this.lightGroups.forEach((group) => {
            group.lights.forEach(light => {
                light.visible = enabled
                // Also toggle the debug helper visibility
                this.toggleDebugHelper(light, enabled)
            })
            group.enabled = enabled
        })
        
        // Emit lighting toggle event
        this.eventManager.emit(LightingEventTypes.Toggle, {
            enabled,
            source: EventSource.UI
        })
        
        // Only update checkbox states, not full UI rebuild
        this.updateCheckboxStates()
    }

    private toggleLightGroup(type: string, enabled: boolean): void {
        const group = this.lightGroups.get(type)
        if (!group) return

        group.lights.forEach(light => {
            light.visible = enabled
            // Also toggle the debug helper visibility
            this.toggleDebugHelper(light, enabled)
        })
        group.enabled = enabled

        LightingControlsPanel.logger.info(`💡 ${enabled ? 'Enabled' : 'Disabled'} ${type} lights (${group.lights.length} lights)`)
        // Only update checkbox states, not full UI rebuild
        this.updateCheckboxStates()
    }

    private toggleIndividualLight(light: THREE.Light, enabled: boolean): void {
        light.visible = enabled
        
        // Also toggle the debug helper visibility
        this.toggleDebugHelper(light, enabled)
        
        const lightName = light.name || `${light.constructor.name}-${light.id}`
        LightingControlsPanel.logger.info(`💡 ${enabled ? 'Enabled' : 'Disabled'} light: ${lightName}`)
        
        // Only update checkbox states, not full UI rebuild
        this.updateCheckboxStates()
    }

    private toggleGroupExpansion(type: string): void {
        const group = this.lightGroups.get(type)
        if (!group) return

        group.collapsed = !group.collapsed

        // Update the UI elements
        const expander = document.querySelector(`.group-expander[data-type="${type}"]`)
        const lightsContainer = document.querySelector(`.group-lights-container[data-type="${type}"]`)
        
        if (expander) {
            if (group.collapsed) {
                expander.classList.add('collapsed')
            } else {
                expander.classList.remove('collapsed')
            }
        }
        
        if (lightsContainer) {
            if (group.collapsed) {
                lightsContainer.classList.add('collapsed')
            } else {
                lightsContainer.classList.remove('collapsed')
            }
        }
    }

    public show(): void {
        this.container.style.display = 'flex'
        
        // Only scan lights and update UI, don't force expand the panel
        // Let it stay in its current collapsed/expanded state
        this.scanLights()
        this.updateUI()
    }

    public hide(): void {
        this.container.style.display = 'none'
        
        // Show the separate button again when panel is hidden
        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'block'
        }
    }

    public toggle(): void {
        if (this.container.style.display === 'none') {
            this.show()
        } else {
            this.hide()
        }
    }

    private togglePanelContent(): void {
        const content = document.getElementById('lighting-panel-content')
        const indicator = document.getElementById('toggle-indicator')
        const panel = this.container
        
        if (!content || !indicator) return

        const isCollapsed = content.classList.contains('collapsed')
        this.panelCollapsed = !isCollapsed // Will be the new state after toggle
        
        if (isCollapsed) {
            // Expand: remove collapsed classes
            content.classList.remove('collapsed')
            panel.classList.remove('horizontally-collapsed')
            indicator.textContent = '▼'
            this.horizontallyCollapsed = false
            this.scanLights()
            this.updateUI()
        } else {
            // Collapse: add collapsed classes
            content.classList.add('collapsed')
            panel.classList.add('horizontally-collapsed')
            indicator.textContent = '▶'
            this.horizontallyCollapsed = true
        }
    }

    private toggleDebugHelper(light: THREE.Light, enabled: boolean): void {
        // Use registry for O(1) lookup instead of scene traversal
        const debugHelper = this.registry.getAttachedGeometry(light)

        if (debugHelper) {
            debugHelper.visible = this.debugIndicatorEnabled && enabled
        }
    }

    private toggleAllDebugHelpers(enabled: boolean): void {
        // Use registry for O(1) lookup instead of scene traversal
        const helpers = this.registry.getAllAttachedGeometry()
        for (const helper of helpers) {
            helper.visible = enabled
        }
    }

    public dispose(): void {
        // Deregister event handlers
        this.eventManager.deregisterEventHandler(LightingEventTypes.Created, this.lightCreatedHandler)
        this.eventManager.deregisterEventHandler(LightingEventTypes.SystemReady, this.lightingSystemReadyHandler)
        
        // Show the separate button again when disposing
        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'block'
        }
        
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container)
        }
    }
}