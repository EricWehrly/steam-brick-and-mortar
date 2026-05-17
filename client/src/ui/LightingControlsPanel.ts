/**
 * Lighting Controls Panel - Real-time lighting control interface
 *
 * Provides granular control over individual lights and light groups:
 * - Master brightness slider for all lights
 * - Per-group brightness sliders
 * - Per-light brightness sliders
 * - Real-time updates with scene integration
 *
 * Uses LightRegistry for O(1) lookups instead of scene traversal.
 */

import * as THREE from 'three'
import { EventManager, EventSource } from '../core/EventManager'
import { LightingEventTypes, type LightCreatedEvent, type LightingSystemReadyEvent } from '../types/LightingEvents'
import { AppSettings } from '../core/AppSettings'
import { LightRegistry } from '../lighting/LightRegistry'
import { Logger } from '../utils/Logger'
import { renderTemplate } from '../utils/TemplateEngine'
import lightingControlsPanelTemplate from '../templates/ui/lighting-controls-panel.html?raw'
import '../styles/lighting-controls-panel.css'

interface LightGroupInfo {
    lights: THREE.Light[]
    collapsed: boolean
    brightness: number
}

export class LightingControlsPanel {
    public static logger = Logger.createLogFunctions(LightingControlsPanel.name)
    private static readonly MAX_BRIGHTNESS_MULTIPLIER = 3
    private static readonly BRIGHTNESS_SLIDER_STEP = 0.01
    private container: HTMLElement
    private lightGroups: Map<string, LightGroupInfo> = new Map()
    private eventManager: EventManager
    private lightCreatedHandler: (event: CustomEvent<LightCreatedEvent>) => void
    private lightingSystemReadyHandler: (event: CustomEvent<LightingSystemReadyEvent>) => void

    private appSettings: AppSettings
    private debugIndicatorEnabled: boolean
    private controlUpdatePending: number | null = null
    private initialScanPerformed = false

    private masterBrightness = 1
    private groupBrightnessByType: Map<string, number> = new Map()
    private lightBrightnessById: Map<number, number> = new Map()
    private baseIntensityById: Map<number, number> = new Map()

    // Use central registry for light and debug helper lookups
    private registry: LightRegistry

    constructor(eventManager: EventManager, appSettings: AppSettings) {
        this.eventManager = eventManager
        this.registry = LightRegistry.getInstance()
        this.lightCreatedHandler = this.onLightCreated.bind(this)
        this.lightingSystemReadyHandler = this.onLightingSystemReady.bind(this)
        this.appSettings = appSettings
        this.debugIndicatorEnabled = this.appSettings.getSetting('showLightingDebug') ?? false
        this.container = this.createPanel()
        this.setupEventListeners()
    }

    private createPanel(): HTMLElement {
        const panel = document.createElement('div')
        panel.id = 'lighting-controls-panel'
        panel.className = 'ui-panel lighting-controls-panel horizontally-collapsible horizontally-collapsed'
        panel.innerHTML = renderTemplate(lightingControlsPanelTemplate, {
            debugIndicatorEnabled: this.debugIndicatorEnabled
        })

        // Hide the separate lighting controls button since we're integrating it into the panel
        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'none'
        }

        const slot = document.getElementById('ui-right-center-group') ?? document.getElementById('ui-slot-top-right')
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
                if ((e.target as HTMLElement).classList.contains('refresh-button')) {
                    return
                }
                this.togglePanelContent()
            })
        }

        // Master brightness slider
        const allLightsSlider = document.getElementById('all-lights-slider') as HTMLInputElement | null
        if (allLightsSlider) {
            allLightsSlider.addEventListener('input', () => {
                this.setMasterBrightness(this.parseSliderValue(allLightsSlider.value))
            })
        }

        // Debug indicator toggle
        const debugToggle = document.getElementById('debug-indicator-toggle') as HTMLInputElement | null
        if (debugToggle) {
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
                e.stopPropagation()
                this.scanLights()
                this.updateUI()
            })
        }
    }

    private setupEventListeners(): void {
        this.eventManager.registerEventHandler(LightingEventTypes.Created, this.lightCreatedHandler)
        this.eventManager.registerEventHandler(LightingEventTypes.SystemReady, this.lightingSystemReadyHandler)
    }

    private onLightCreated(event: CustomEvent<LightCreatedEvent>): void {
        LightingControlsPanel.logger.debug(`💡 Light created: ${event.detail.lightType} (${event.detail.lightName || 'unnamed'})`)

        if (!this.initialScanPerformed) {
            this.initialScanPerformed = true
            this.scanLights()
            this.updateUI()
            this.doUpdateControlStates()
        }

        this.addLightToGroups(event.detail.light, event.detail.lightType)
        this.updateUI()
    }

    private onLightingSystemReady(event: CustomEvent<LightingSystemReadyEvent>): void {
        LightingControlsPanel.logger.debug(`💡 Lighting system ready: ${event.detail.quality} quality`)

        if (!this.initialScanPerformed) {
            this.initialScanPerformed = true
            this.scanLights()
            this.updateUI()
            this.doUpdateControlStates()
        }

        this.scanLights()
        this.updateUI()
    }

    private addLightToGroups(light: THREE.Light, lightType: string): void {
        if (!this.lightGroups.has(lightType)) {
            const brightness = this.groupBrightnessByType.get(lightType) ?? 1
            this.groupBrightnessByType.set(lightType, brightness)
            this.lightGroups.set(lightType, {
                lights: [],
                collapsed: true,
                brightness
            })
        }

        const group = this.lightGroups.get(lightType)
        if (!group) return

        if (!group.lights.includes(light)) {
            group.lights.push(light)
        }

        this.ensureLightState(light)
        this.applyBrightnessToLight(light, lightType)
    }

    private scanLights(): void {
        const newGroups = new Map<string, LightGroupInfo>()
        const groupedLights = this.registry.getLightsGroupedByType()

        for (const [lightType, lights] of groupedLights) {
            const existing = this.lightGroups.get(lightType)
            const brightness = this.groupBrightnessByType.get(lightType) ?? existing?.brightness ?? 1
            this.groupBrightnessByType.set(lightType, brightness)

            newGroups.set(lightType, {
                lights: [...lights],
                collapsed: existing?.collapsed ?? true,
                brightness
            })

            for (const light of lights) {
                this.ensureLightState(light)
            }
        }

        this.lightGroups = newGroups
        this.applyBrightnessToAllLights()
    }

    private updateUI(): void {
        this.updateLightGroups()
        this.doUpdateControlStates()
    }

    private updateLightGroups(): void {
        const container = document.getElementById('light-groups-container')
        if (!container) return

        container.innerHTML = ''

        this.lightGroups.forEach((group, type) => {
            const groupElement = document.createElement('div')
            groupElement.className = 'light-group ui-group'

            const groupHeader = document.createElement('div')
            groupHeader.className = 'group-header ui-group-header'

            const sliderArea = document.createElement('div')
            sliderArea.className = 'group-slider-area ui-group-toggle'
            sliderArea.innerHTML = `
                <span class="control-label ui-control-label">${type} (${group.lights.length})</span>
                <input type="range" min="0" max="${LightingControlsPanel.MAX_BRIGHTNESS_MULTIPLIER}" step="${LightingControlsPanel.BRIGHTNESS_SLIDER_STEP}" class="group-brightness-slider" data-type="${type}">
                <span class="slider-value" data-group-value="${type}"></span>
            `

            const expander = document.createElement('span')
            expander.className = `group-expander ui-group-expander${group.collapsed ? ' collapsed' : ''}`
            expander.textContent = '▼'
            expander.dataset.type = type

            groupHeader.appendChild(sliderArea)
            groupHeader.appendChild(expander)
            groupElement.appendChild(groupHeader)

            const lightsContainer = document.createElement('div')
            lightsContainer.className = `group-lights-container${group.collapsed ? ' collapsed' : ''}`
            lightsContainer.dataset.type = type

            group.lights.forEach((light, index) => {
                const lightElement = document.createElement('div')
                lightElement.className = 'individual-light'

                const lightName = light.name || `${type}-${index}`
                lightElement.innerHTML = `
                    <label class="control-item light-control">
                        <span class="control-label ui-control-label">${lightName}</span>
                        <input type="range" min="0" max="${LightingControlsPanel.MAX_BRIGHTNESS_MULTIPLIER}" step="${LightingControlsPanel.BRIGHTNESS_SLIDER_STEP}" class="light-brightness-slider" data-light-id="${light.id}" data-type="${type}">
                        <span class="slider-value" data-light-value="${light.id}"></span>
                        <span class="light-info" data-light-info="${light.id}"></span>
                    </label>
                `

                const lightSlider = lightElement.querySelector('.light-brightness-slider') as HTMLInputElement
                lightSlider.addEventListener('input', () => {
                    this.setIndividualBrightness(light, type, this.parseSliderValue(lightSlider.value))
                })

                lightsContainer.appendChild(lightElement)
            })

            groupElement.appendChild(lightsContainer)

            const groupSlider = sliderArea.querySelector('.group-brightness-slider') as HTMLInputElement
            groupSlider.addEventListener('input', () => {
                this.setGroupBrightness(type, this.parseSliderValue(groupSlider.value))
            })

            expander.addEventListener('click', () => {
                this.toggleGroupExpansion(type)
            })

            container.appendChild(groupElement)
            this.syncGroupContainerHeight(lightsContainer, group.collapsed)
        })
    }

    private doUpdateControlStates(): void {
        this.controlUpdatePending = null

        const masterSlider = document.getElementById('all-lights-slider') as HTMLInputElement | null
        const masterValue = document.getElementById('all-lights-value')
        if (masterSlider) {
            masterSlider.value = this.masterBrightness.toFixed(2)
        }
        if (masterValue) {
            masterValue.textContent = this.formatBrightness(this.masterBrightness)
        }

        this.lightGroups.forEach((group, type) => {
            const groupSlider = document.querySelector(`.group-brightness-slider[data-type="${type}"]`) as HTMLInputElement | null
            const groupValue = document.querySelector(`[data-group-value="${type}"]`)
            if (groupSlider) {
                groupSlider.value = group.brightness.toFixed(2)
            }
            if (groupValue) {
                groupValue.textContent = this.formatBrightness(group.brightness)
            }

            group.lights.forEach((light) => {
                const lightMultiplier = this.lightBrightnessById.get(light.id) ?? 1
                const lightSlider = document.querySelector(`.light-brightness-slider[data-light-id="${light.id}"]`) as HTMLInputElement | null
                const lightValue = document.querySelector(`[data-light-value="${light.id}"]`)
                const lightInfo = document.querySelector(`[data-light-info="${light.id}"]`)

                if (lightSlider) {
                    lightSlider.value = lightMultiplier.toFixed(2)
                }
                if (lightValue) {
                    lightValue.textContent = this.formatBrightness(lightMultiplier)
                }
                if (lightInfo) {
                    lightInfo.textContent = this.getLightInfo(light, type)
                }
            })
        })
    }

    private updateControlStates(): void {
        if (this.controlUpdatePending !== null) {
            cancelAnimationFrame(this.controlUpdatePending)
        }
        this.controlUpdatePending = requestAnimationFrame(this.doUpdateControlStates.bind(this))
    }

    private setMasterBrightness(brightness: number): void {
        this.masterBrightness = this.clampBrightness(brightness)
        this.applyBrightnessToAllLights()
        this.updateControlStates()
    }

    private setGroupBrightness(type: string, brightness: number): void {
        const group = this.lightGroups.get(type)
        if (!group) return

        group.brightness = this.clampBrightness(brightness)
        this.groupBrightnessByType.set(type, group.brightness)

        for (const light of group.lights) {
            this.applyBrightnessToLight(light, type)
        }

        this.updateControlStates()
    }

    private setIndividualBrightness(light: THREE.Light, type: string, brightness: number): void {
        const clamped = this.clampBrightness(brightness)
        this.lightBrightnessById.set(light.id, clamped)
        this.applyBrightnessToLight(light, type)
        this.updateControlStates()
    }

    private applyBrightnessToAllLights(): void {
        this.lightGroups.forEach((group, type) => {
            for (const light of group.lights) {
                this.applyBrightnessToLight(light, type)
            }
        })
    }

    private applyBrightnessToLight(light: THREE.Light, type: string): void {
        const baseIntensity = this.getBaseIntensity(light)
        const groupMultiplier = this.groupBrightnessByType.get(type) ?? 1
        const lightMultiplier = this.lightBrightnessById.get(light.id) ?? 1
        const effectiveMultiplier = this.masterBrightness * groupMultiplier * lightMultiplier

        light.intensity = baseIntensity * effectiveMultiplier

        const isVisible = effectiveMultiplier > 0.001
        light.visible = isVisible
        this.toggleDebugHelper(light, isVisible)
    }

    private ensureLightState(light: THREE.Light): void {
        if (!this.baseIntensityById.has(light.id)) {
            this.baseIntensityById.set(light.id, Number.isFinite(light.intensity) ? light.intensity : 1)
        }
        if (!this.lightBrightnessById.has(light.id)) {
            this.lightBrightnessById.set(light.id, 1)
        }
    }

    private getBaseIntensity(light: THREE.Light): number {
        if (!this.baseIntensityById.has(light.id)) {
            this.baseIntensityById.set(light.id, Number.isFinite(light.intensity) ? light.intensity : 1)
        }
        return this.baseIntensityById.get(light.id) ?? 1
    }

    private getLightInfo(light: THREE.Light, type: string): string {
        const info: string[] = []
        const groupMultiplier = this.groupBrightnessByType.get(type) ?? 1
        const lightMultiplier = this.lightBrightnessById.get(light.id) ?? 1
        const effectiveMultiplier = this.masterBrightness * groupMultiplier * lightMultiplier
        info.push(`x${effectiveMultiplier.toFixed(2)}`)

        if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
            info.push(`D:${light.distance}`)
        }

        if (light instanceof THREE.RectAreaLight) {
            info.push(`${light.width}×${light.height}`)
        }

        return `(${info.join(', ')})`
    }

    private toggleGroupExpansion(type: string): void {
        const group = this.lightGroups.get(type)
        if (!group) return

        group.collapsed = !group.collapsed

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
            this.syncGroupContainerHeight(lightsContainer, group.collapsed)
        }
    }

    private syncGroupContainerHeight(lightsContainer: Element, collapsed: boolean): void {
        if (!(lightsContainer instanceof HTMLElement)) return

        if (collapsed) {
            lightsContainer.style.maxHeight = `${lightsContainer.scrollHeight}px`
            requestAnimationFrame(() => {
                lightsContainer.classList.add('collapsed')
                lightsContainer.style.maxHeight = '0px'
            })
            return
        }

        lightsContainer.classList.remove('collapsed')
        lightsContainer.style.maxHeight = `${lightsContainer.scrollHeight}px`
    }

    private parseSliderValue(rawValue: string): number {
        const parsed = Number.parseFloat(rawValue)
        if (!Number.isFinite(parsed)) return 1
        return this.clampBrightness(parsed)
    }

    private clampBrightness(value: number): number {
        if (value < 0) return 0
        if (value > LightingControlsPanel.MAX_BRIGHTNESS_MULTIPLIER) return LightingControlsPanel.MAX_BRIGHTNESS_MULTIPLIER
        return value
    }

    private formatBrightness(value: number): string {
        return `${Math.round(value * 100)}%`
    }

    public show(): void {
        this.container.style.display = 'flex'
        this.scanLights()
        this.updateUI()
    }

    public hide(): void {
        this.container.style.display = 'none'

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

        const isCollapsed = panel.classList.contains('horizontally-collapsed')

        if (isCollapsed) {
            panel.classList.remove('horizontally-collapsed')
            indicator.textContent = '▼'
            this.scanLights()
            this.updateUI()
        } else {
            panel.classList.add('horizontally-collapsed')
            indicator.textContent = '▶'
        }
    }

    private toggleDebugHelper(light: THREE.Light, enabled: boolean): void {
        const debugHelper = this.registry.getAttachedGeometry(light)
        if (debugHelper) {
            debugHelper.visible = this.debugIndicatorEnabled && enabled
        }
    }

    private toggleAllDebugHelpers(enabled: boolean): void {
        const helpers = this.registry.getAllAttachedGeometry()
        for (const helper of helpers) {
            helper.visible = enabled
        }
    }

    public dispose(): void {
        this.eventManager.deregisterEventHandler(LightingEventTypes.Created, this.lightCreatedHandler)
        this.eventManager.deregisterEventHandler(LightingEventTypes.SystemReady, this.lightingSystemReadyHandler)

        if (this.controlUpdatePending !== null) {
            cancelAnimationFrame(this.controlUpdatePending)
            this.controlUpdatePending = null
        }

        const separateButton = document.getElementById('lighting-controls-button')
        if (separateButton) {
            separateButton.style.display = 'block'
        }

        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container)
        }
    }
}
