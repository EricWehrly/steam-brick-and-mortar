/**
 * Lighting Controls Panel - Real-time lighting control interface
 * 
 * Provides granular control over individual lights and light groups:
 * - Toggle individual lights on/off
 * - Group lights by type (RectAreaLight, SpotLight, etc.)
 * - Master controls for entire light types
 * - Real-time updates with scene integration
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../core/EventManager'
import { LightingEventTypes, type LightCreatedEvent } from '../types/InteractionEvents'

interface LightGroupInfo {
    type: string
    lights: THREE.Light[]
    enabled: boolean
}

export class LightingControlsPanel {
    private container: HTMLElement
    private scene: THREE.Scene | null = null
    private lightGroups: Map<string, LightGroupInfo> = new Map()
    private eventManager: EventManager
    private lightCreatedHandler: (event: CustomEvent<LightCreatedEvent>) => void

    constructor() {
        this.eventManager = EventManager.getInstance()
        this.lightCreatedHandler = this.onLightCreated.bind(this)
        this.container = this.createPanel()
        this.setupEventListeners()
        // No initial scan - we'll scan when we get the first light event
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement('div')
        panel.id = 'lighting-controls-panel'
        panel.className = 'lighting-controls-panel'
        panel.innerHTML = `
            <div class="panel-header clickable-header" id="lighting-panel-header">
                <h3>💡 Lighting Controls</h3>
                <div class="header-controls">
                    <button class="refresh-button" id="refresh-lights">🔄</button>
                    <span class="toggle-indicator" id="toggle-indicator">▼</span>
                </div>
            </div>
            <div class="panel-content" id="lighting-panel-content">
                <div class="master-controls">
                    <label class="control-item">
                        <input type="checkbox" id="all-lights-toggle" checked>
                        <span class="control-label">All Lights</span>
                    </label>
                </div>
                <div class="light-groups" id="light-groups-container">
                    <!-- Light groups will be populated here -->
                </div>
                <div class="individual-lights" id="individual-lights-container">
                    <!-- Individual lights will be populated here -->
                </div>
            </div>
        `

        // Position the panel in middle-right
        panel.style.cssText = `
            position: absolute;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            width: 280px;
            max-height: 60vh;
            background: rgba(0, 0, 0, 0.85);
            border: 2px solid #333;
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `

        // Hide the separate lighting controls button since we're integrating it into the panel
        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'none'
        }

        // Add styles for the clickable header and better layout
        const style = document.createElement('style')
        style.textContent = `
            .lighting-controls-panel .clickable-header {
                padding: 8px 12px;
                background: rgba(40, 40, 40, 0.9);
                border-bottom: 1px solid #555;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background-color 0.2s ease;
            }
            .lighting-controls-panel .clickable-header:hover {
                background: rgba(60, 60, 60, 0.9);
            }
            .lighting-controls-panel .clickable-header h3 {
                margin: 0;
                font-size: 14px;
                user-select: none;
            }
            .lighting-controls-panel .header-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .lighting-controls-panel .toggle-indicator {
                font-size: 12px;
                color: #aaa;
                user-select: none;
                transition: transform 0.2s ease;
            }
            .lighting-controls-panel .refresh-button {
                background: none;
                border: none;
                color: #aaa;
                cursor: pointer;
                font-size: 12px;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background-color 0.2s ease;
            }
            .lighting-controls-panel .refresh-button:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }
            .lighting-controls-panel .panel-content {
                padding: 12px;
                overflow-y: auto;
                flex: 1;
            }
        `
        document.head.appendChild(style)

        document.body.appendChild(panel)
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
            panelHeader.style.cursor = 'pointer'
        }

        // Master toggle
        const allLightsToggle = document.getElementById('all-lights-toggle') as HTMLInputElement
        if (allLightsToggle) {
            allLightsToggle.addEventListener('change', () => {
                this.toggleAllLights(allLightsToggle.checked)
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
    }

    private onLightCreated(event: CustomEvent<LightCreatedEvent>): void {
        console.log(`💡 Light created: ${event.detail.lightType} (${event.detail.lightName || 'unnamed'})`)
        
        // Get scene from the first light event
        if (!this.scene) {
            this.scene = event.detail.scene
            this.performInitialScan() // Now we can scan for existing lights
        }
        
        this.addLightToGroups(event.detail.light, event.detail.lightType)
        this.updateUI()
    }

    private addLightToGroups(light: THREE.Light, lightType: string): void {
        if (!this.lightGroups.has(lightType)) {
            this.lightGroups.set(lightType, {
                type: lightType,
                lights: [],
                enabled: true
            })
        }
        
        const group = this.lightGroups.get(lightType)!
        group.lights.push(light)
        
        // Update enabled state based on light visibility
        const enabledCount = group.lights.filter(l => l.visible).length
        group.enabled = enabledCount > 0
    }

    private performInitialScan(): void {
        // Initial scan to catch any existing lights
        this.scanLights()
        this.updateUI()
    }



    private scanLights(): void {
        const newGroups = new Map<string, LightGroupInfo>()

        // Guard against invalid scene objects (e.g., in tests)
        if (!this.scene || typeof this.scene.traverse !== 'function') {
            console.warn('⚠️ Invalid scene object - skipping light scan')
            this.lightGroups = newGroups
            return
        }

        // Traverse the scene to find all lights
        this.scene.traverse((object) => {
            if (object instanceof THREE.Light) {
                const lightType = object.constructor.name
                
                if (!newGroups.has(lightType)) {
                    newGroups.set(lightType, {
                        type: lightType,
                        lights: [],
                        enabled: true
                    })
                }
                
                newGroups.get(lightType)!.lights.push(object)
            }
        })

        // Update enabled states based on current visibility
        newGroups.forEach((group, type) => {
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
            groupElement.innerHTML = `
                <label class="control-item group-control">
                    <input type="checkbox" class="group-toggle" data-type="${type}" ${group.enabled ? 'checked' : ''}>
                    <span class="control-label">${type} (${group.lights.length})</span>
                </label>
            `

            const checkbox = groupElement.querySelector('.group-toggle') as HTMLInputElement
            checkbox.addEventListener('change', () => {
                this.toggleLightGroup(type, checkbox.checked)
            })

            container.appendChild(groupElement)
        })
    }

    private updateIndividualLights(): void {
        const container = document.getElementById('individual-lights-container')
        if (!container) return

        container.innerHTML = '<h4>Individual Lights</h4>'

        this.lightGroups.forEach((group, type) => {
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

                const checkbox = lightElement.querySelector('.light-toggle') as HTMLInputElement
                checkbox.addEventListener('change', () => {
                    this.toggleIndividualLight(light, checkbox.checked)
                })

                container.appendChild(lightElement)
            })
        })
    }

    private updateMasterToggle(): void {
        const masterToggle = document.getElementById('all-lights-toggle') as HTMLInputElement
        if (!masterToggle) return

        const allLights = Array.from(this.lightGroups.values()).flatMap(group => group.lights)
        const enabledLights = allLights.filter(light => light.visible)
        
        masterToggle.checked = enabledLights.length === allLights.length
        masterToggle.indeterminate = enabledLights.length > 0 && enabledLights.length < allLights.length
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
            timestamp: Date.now(),
            source: EventSource.UI
        })
        
        this.updateUI()
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

        console.log(`💡 ${enabled ? 'Enabled' : 'Disabled'} ${type} lights (${group.lights.length} lights)`)
        this.updateUI()
    }

    private toggleIndividualLight(light: THREE.Light, enabled: boolean): void {
        light.visible = enabled
        
        // Also toggle the debug helper visibility
        this.toggleDebugHelper(light, enabled)
        
        const lightName = light.name || `${light.constructor.name}-${light.id}`
        console.log(`💡 ${enabled ? 'Enabled' : 'Disabled'} light: ${lightName}`)
        
        this.updateUI()
    }

    public show(): void {
        this.container.style.display = 'flex'
        const content = document.getElementById('lighting-panel-content')
        const indicator = document.getElementById('toggle-indicator')
        
        if (content && indicator) {
            content.style.display = 'block'
            indicator.textContent = '▼'
        }
        
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
        
        if (!content || !indicator) return

        const isCollapsed = content.style.display === 'none'
        
        if (isCollapsed) {
            content.style.display = 'block'
            indicator.textContent = '▼'
            this.scanLights()
            this.updateUI()
        } else {
            content.style.display = 'none'
            indicator.textContent = '▶'
        }
    }

    private toggleDebugHelper(light: THREE.Light, enabled: boolean): void {
        if (!this.scene) return

        // Generate the debug helper name based on light type and name
        const lightName = light.name || 'unnamed'
        let debugHelperName = ''
        
        if (light instanceof THREE.PointLight) {
            debugHelperName = `debug-point-${lightName}`
        } else if (light instanceof THREE.SpotLight) {
            debugHelperName = `debug-spot-${lightName}`
        } else if (light instanceof THREE.RectAreaLight) {
            debugHelperName = `debug-rectarea-${lightName}`
        } else if (light instanceof THREE.DirectionalLight) {
            debugHelperName = `debug-directional-${lightName}`
        } else {
            // Unknown light type - no debug helper to toggle
            return
        }

        // Find the debug helper in the scene by traversing all objects
        let debugHelper: THREE.Object3D | null = null
        this.scene.traverse((object) => {
            if (object.name === debugHelperName) {
                debugHelper = object
            }
        })

        if (debugHelper) {
            debugHelper.visible = enabled
            // console.log(`🔍 ${enabled ? 'Showed' : 'Hid'} debug helper: ${debugHelperName}`)
        }
    }

    public dispose(): void {
        // Deregister event handlers
        this.eventManager.deregisterEventHandler(LightingEventTypes.Created, this.lightCreatedHandler)
        
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