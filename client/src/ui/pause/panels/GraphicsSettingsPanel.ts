/**
 * GraphicsSettingsPanel - Graphics and visual settings
 * 
 * Dedicated panel for graphics-related settings:
 * - Lighting quality (simple/enhanced/advanced/ouch-my-eyes)
 * - Shadow settings (enable/disable)
 * - Ceiling height adjustment
 * - Other visual performance options
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import graphicsSettingsPanelTemplate from '../../../templates/pause-menu/graphics-settings-panel.html?raw'
import '../../../styles/pause-menu/graphics-settings-panel.css'
import { AppSettings, LIGHTING_QUALITY, Setting, SettingCategory, type ApplicationSettings, type QualityLevel, type SettingChangedEvent } from '../../../core/AppSettings'
import { SSAO_QUALITY_LEVELS } from '../../../scene/RenderPipelineManager'
import { EventManager, EventSource } from '../../../core/EventManager'
import type * as THREE from 'three'
import { AppSettingsEventTypes, CeilingEventTypes } from '../../../types/InteractionEvents'
import { LightingEventTypes, type CeilingToggleEvent, type LightingToggleEvent, type LightingDebugToggleEvent } from '../../../types/LightingEvents'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { RangeControl, SelectControl } from '../../components/UIComponent'

export class GraphicsSettingsPanel extends PauseMenuPanel {
    readonly id = 'graphics-settings'
    readonly title = 'Graphics'
    readonly icon = '🎨'

    private appSettings: AppSettings
    private renderer: THREE.WebGLRenderer | null = null

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings) {
        super(config)
        this.appSettings = appSettings
    }

    initialize(callbacks: { renderer?: THREE.WebGLRenderer }): void {
        this.renderer = callbacks.renderer ?? null
        this.subscribeToSettingsChanges()
    }

    private subscribeToSettingsChanges(): void {
        const eventManager = EventManager.getInstance()
        eventManager.registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            (event) => this.applySettingToScene(event.detail)
        )
    }

    private applySettingToScene(event: SettingChangedEvent): void {
        const { settingName, value } = event
        const eventManager = EventManager.getInstance()

        if ((settingName === Setting.ShadowMapEnabled || settingName === Setting.PixelRatioScale) && this.renderer) {
            if (settingName === Setting.ShadowMapEnabled) {
                this.renderer.shadowMap.enabled = value as boolean
            } else {
                const clampedRatio = Math.max(0.25, Math.min(2, value as number))
                this.renderer.setPixelRatio(clampedRatio)
            }
        }

        if (settingName === Setting.LightingQuality) {
            eventManager.emit(LightingEventTypes.QualityChanged, {
                quality: value as ApplicationSettings['lightingQuality'],
                source: EventSource.UI
            })
        }

        if (settingName === Setting.ShadowMapEnabled || settingName === Setting.ShadowQuality) {
            eventManager.emit(LightingEventTypes.QualityChanged, {
                quality: this.appSettings.getSetting('lightingQuality'),
                source: EventSource.UI
            })
        }

        if (settingName === Setting.EnableLighting) {
            eventManager.emit(LightingEventTypes.Toggle, {
                enabled: value as boolean
            } as LightingToggleEvent)
        }

        if (settingName === Setting.ShowLightingDebug) {
            eventManager.emit(LightingEventTypes.DebugToggle, {
                enabled: value as boolean
            } as LightingDebugToggleEvent)
        }
    }

    render(): string {
        const lodHighRatio = this.appSettings.getSetting('lodHighReductionRatio')
        const lodMedRatio = this.appSettings.getSetting('lodMedReductionRatio')
        const lodMaxHighSlots = this.appSettings.getSetting('lodMaxHighSlots')
        const qualityLevel = this.appSettings.getSetting('qualityLevel')
        const lightingQuality = this.appSettings.getSetting('lightingQuality')
        const smaaPreset = this.appSettings.getSetting('smaaPreset')
        const msaaLevel = this.appSettings.getSetting('msaaLevel')
        const shadowQuality = this.appSettings.getSetting('shadowQuality')
        const pixelRatioScale = this.appSettings.getSetting('pixelRatioScale')
        const ssaoQuality = this.appSettings.getSetting('ssaoQuality')

        return renderTemplate(graphicsSettingsPanelTemplate, {
            fullscreenEnabled: !!document.fullscreenElement,
            shadowMapEnabled: this.appSettings.getSetting('shadowMapEnabled'),
            enableLighting: this.appSettings.getSetting('enableLighting'),
            showLightingDebug: this.appSettings.getSetting('showLightingDebug'),
            showCeiling: this.appSettings.getSetting('showCeiling'),

            qualityLevelControl: new SelectControl({
                id: 'quality-level-select',
                label: '⚙️ Renderer Quality Preset',
                options: [
                    { value: 'low', label: 'Low', selected: qualityLevel === 'low' },
                    { value: 'medium', label: 'Medium', selected: qualityLevel === 'medium' },
                    { value: 'high', label: 'High', selected: qualityLevel === 'high' },
                    { value: 'ultra', label: 'Ultra', selected: qualityLevel === 'ultra' }
                ]
            }).render(),

            pixelRatioControl: new RangeControl({
                id: 'pixel-ratio-scale',
                label: 'Pixel Ratio Scale',
                hint: { text: 'experimental', kind: 'instant' },
                min: 0.5,
                max: 2.0,
                step: 0.05,
                value: pixelRatioScale,
                formatDisplay: (v) => v.toFixed(2),
                trackLabels: ['0.5', '2.0'],
                valueId: 'pixel-ratio-value'
            }).render(),

            lightingQualityControl: new SelectControl({
                id: 'lighting-quality',
                label: '💡 Lighting Quality',
                description: 'Higher quality provides better visuals but may impact performance. Changes apply immediately.',
                options: [
                    { value: LIGHTING_QUALITY.SIMPLE, label: 'Simple - Basic lighting only (higher ambient, fewer lights)', selected: lightingQuality === LIGHTING_QUALITY.SIMPLE },
                    { value: LIGHTING_QUALITY.ENHANCED, label: 'Enhanced - Fluorescent fixtures + standard shadows', selected: lightingQuality === LIGHTING_QUALITY.ENHANCED },
                    { value: LIGHTING_QUALITY.ADVANCED, label: 'Advanced - Point lights + soft shadows + enhanced quality', selected: lightingQuality === LIGHTING_QUALITY.ADVANCED },
                    { value: LIGHTING_QUALITY.OUCH_MY_EYES, label: 'Ouch My Eyes - Dramatic spotlights + colored accents + ultra shadows', selected: lightingQuality === LIGHTING_QUALITY.OUCH_MY_EYES }
                ]
            }).render(),

            shadowQualityControl: new RangeControl({
                id: 'shadow-quality',
                label: '🌓 Shadow Quality',
                description: 'Higher shadow quality improves depth perception but requires more processing power. Set to "Off" to disable shadows entirely.',
                hint: { text: '✨ instant', kind: 'instant' },
                min: 0,
                max: 4,
                step: 1,
                value: shadowQuality,
                formatDisplay: (v) => this.getShadowQualityLabel(v),
                trackLabels: ['Off', 'Low', 'Medium', 'High', 'Ultra']
            }).render(),

            ssaoQualityControl: new RangeControl({
                id: 'ssao-quality',
                label: '💫 SSAO (Ambient Occlusion)',
                description: 'Contact shadows and crevice darkening. Off disables it entirely; levels are ordered by measured GPU cost, not just sample count — see the label for what each one actually does.',
                hint: { text: '✨ instant', kind: 'instant' },
                min: 0,
                max: SSAO_QUALITY_LEVELS.length - 1,
                step: 1,
                value: ssaoQuality,
                formatDisplay: (v) => this.getSsaoQualityLabel(v),
                trackLabels: ['Off', SSAO_QUALITY_LEVELS[SSAO_QUALITY_LEVELS.length - 1].label]
            }).render(),

            smaaPresetControl: new SelectControl({
                id: 'smaa-preset',
                label: 'Anti-Aliasing (SMAA)',
                description: 'Post-process edge smoothing — runs after lighting/effects, catches all edge types. Independent of MSAA below; the two can stack.',
                hint: { text: '✨ instant', kind: 'instant' },
                options: [
                    { value: 'low', label: 'Low', selected: smaaPreset === 'low' },
                    { value: 'medium', label: 'Medium', selected: smaaPreset === 'medium' },
                    { value: 'high', label: 'High', selected: smaaPreset === 'high' },
                    { value: 'ultra', label: 'Ultra', selected: smaaPreset === 'ultra' }
                ]
            }).render(),

            msaaLevelControl: new SelectControl({
                id: 'msaa-level',
                label: 'Anti-Aliasing (MSAA)',
                description: 'Hardware multisampling — runs before lighting/effects, only smooths geometry edges. Costs more here than SMAA above; try SMAA first.',
                hint: { text: '✨ instant', kind: 'instant' },
                options: [
                    { value: 'low', label: 'Off', selected: msaaLevel === 'low' },
                    { value: 'medium', label: '2x', selected: msaaLevel === 'medium' },
                    { value: 'high', label: '4x', selected: msaaLevel === 'high' },
                    { value: 'ultra', label: '8x', selected: msaaLevel === 'ultra' }
                ]
            }).render(),

            ceilingHeightControl: new RangeControl({
                id: 'ceiling-height',
                label: '📏 Ceiling Height',
                description: 'Adjust the store ceiling height for comfort and immersion. Changes require scene reload.',
                hint: { text: '🔄 reload', kind: 'reload' },
                requiresReload: true,
                min: 2.5,
                max: 5.0,
                step: 0.1,
                value: this.appSettings.getSetting('ceilingHeight'),
                formatDisplay: (v) => `${v}m`,
                trackLabels: ['2.5m', '5.0m']
            }).render(),

            environmentIntensityControl: new RangeControl({
                id: 'environment-intensity',
                label: '🌐 Environment Intensity',
                description: 'IBL (image-based lighting) contribution from the room environment. Lower values let hand-authored lights dominate; higher values brighten specular reflections.',
                hint: { text: '✨ instant', kind: 'instant' },
                min: 0,
                max: 2,
                step: 0.05,
                value: this.appSettings.getSetting('environmentIntensity'),
                formatDisplay: (v) => v.toFixed(2),
                trackLabels: ['0.0', '1.0', '2.0']
            }).render(),

            lodHighDistanceControl: new RangeControl({
                id: 'lod-high-distance',
                label: 'HIGH quality within',
                min: 1,
                max: 10,
                step: 0.5,
                value: this.appSettings.getSetting('lodHighDistance'),
                formatDisplay: (v) => `${v}m`,
                trackLabels: ['1m', '10m']
            }).render(),

            lodMedDistanceControl: new RangeControl({
                id: 'lod-med-distance',
                label: 'MED quality within',
                min: 3,
                max: 20,
                step: 0.5,
                value: this.appSettings.getSetting('lodMedDistance'),
                formatDisplay: (v) => `${v}m`,
                trackLabels: ['3m', '20m']
            }).render(),

            lodMaxHighSlotsControl: new RangeControl({
                id: 'lod-max-high-slots',
                label: 'Max HIGH texture slots',
                labelExtra: `<span class="setting-hint" id="lod-vram-estimate">(~${this.calculateVramEstimate(lodMaxHighSlots, lodHighRatio)}MB VRAM)</span>`,
                hint: { text: '🔄 reload', kind: 'reload' },
                requiresReload: true,
                min: 32,
                max: 512,
                step: 32,
                value: lodMaxHighSlots,
                trackLabels: ['32 slots', '512 slots']
            }).render(),

            lodHighRatioControl: new RangeControl({
                id: 'lod-high-ratio',
                label: 'HIGH texture scale',
                labelExtra: `<span class="setting-hint">(<span id="lod-high-dimensions">${this.calculateDimensions(lodHighRatio)}</span>)</span>`,
                hint: { text: '🔄 reload', kind: 'reload' },
                requiresReload: true,
                min: 0.25,
                max: 1.0,
                step: 0.05,
                value: lodHighRatio,
                formatDisplay: (v) => `${Math.round(v * 100)}%`,
                trackLabels: ['25%', '100%']
            }).render(),

            lodMedRatioControl: new RangeControl({
                id: 'lod-med-ratio',
                label: 'MED texture scale',
                labelExtra: `<span class="setting-hint">(<span id="lod-med-dimensions">${this.calculateDimensions(lodMedRatio)}</span>)</span>`,
                hint: { text: '🔄 reload', kind: 'reload' },
                requiresReload: true,
                min: 0.1,
                max: 0.5,
                step: 0.05,
                value: lodMedRatio,
                formatDisplay: (v) => `${Math.round(v * 100)}%`,
                trackLabels: ['10%', '50%']
            }).render()
        })
    }

    attachEvents(): void {
        this.attachSelectEvents()
        this.attachCheckboxEvents()
        this.attachSliderEvents()
        this.attachButtonEvents()
    }

    private attachSelectEvents(): void {
        UIComponentUtils.setupSelect<ApplicationSettings['qualityLevel']>(document.body, {
            selectId: 'quality-level-select',
            onChange: (quality) => {
                this.applyQualityPreset(quality)
                this.updateSetting('qualityLevel', quality)
            }
        })

        UIComponentUtils.setupSelect<ApplicationSettings['lightingQuality']>(document.body, {
            selectId: 'lighting-quality',
            onChange: (quality) => this.updateSetting('lightingQuality', quality)
        })

        UIComponentUtils.setupSelect<ApplicationSettings['smaaPreset']>(document.body, {
            selectId: 'smaa-preset',
            onChange: (preset) => this.updateSetting('smaaPreset', preset)
        })

        UIComponentUtils.setupSelect<ApplicationSettings['msaaLevel']>(document.body, {
            selectId: 'msaa-level',
            onChange: (level) => this.updateSetting('msaaLevel', level)
        })
    }

    private attachCheckboxEvents(): void {
        UIComponentUtils.setupToggles(document.body, [
            {
                toggleId: 'fullscreen-enabled',
                onChange: (checked) => this.setFullscreenEnabled(checked)
            },
            {
                toggleId: 'enable-lighting',
                onChange: (checked) => this.updateSetting('enableLighting', checked)
            },
            {
                toggleId: 'show-lighting-debug',
                onChange: (checked) => this.updateSetting('showLightingDebug', checked)
            },
            {
                toggleId: 'show-ceiling',
                onChange: (checked) => {
                    this.updateSetting('showCeiling', checked)
                    
                    const ceilingEvent: CeilingToggleEvent = {
                        visible: checked,
                        source: EventSource.UI
                    }
                    EventManager.getInstance().emit(CeilingEventTypes.Toggle, ceilingEvent)
                }
            },
            {
                toggleId: 'shadow-map-enabled',
                onChange: (checked) => this.updateSetting('shadowMapEnabled', checked)
            }
        ])
    }

    private attachSliderEvents(): void {
        UIComponentUtils.setupSliders(document.body, [
            {
                sliderId: 'shadow-quality',
                valueDisplayId: 'shadow-quality-value',
                formatDisplay: (v) => this.getShadowQualityLabel(v),
                onInput: (value) => this.updateSetting('shadowQuality', value)
            },
            {
                sliderId: 'ssao-quality',
                valueDisplayId: 'ssao-quality-value',
                formatDisplay: (v) => this.getSsaoQualityLabel(v),
                onInput: (value) => this.updateSetting('ssaoQuality', value)
            },
            {
                sliderId: 'ceiling-height',
                valueDisplayId: 'ceiling-height-value',
                formatDisplay: (v) => `${v}m`,
                onChange: (value) => this.updateSetting('ceilingHeight', value)
            },
            {
                sliderId: 'environment-intensity',
                valueDisplayId: 'environment-intensity-value',
                formatDisplay: (v) => v.toFixed(2),
                onInput: (value) => this.updateSetting('environmentIntensity', value)
            },
            {
                sliderId: 'lod-high-distance',
                valueDisplayId: 'lod-high-distance-value',
                formatDisplay: (v) => `${v}m`,
                onInput: (value) => this.updateSetting('lodHighDistance', value)
            },
            {
                sliderId: 'lod-med-distance',
                valueDisplayId: 'lod-med-distance-value',
                formatDisplay: (v) => `${v}m`,
                onInput: (value) => this.updateSetting('lodMedDistance', value)
            },
            {
                sliderId: 'lod-max-high-slots',
                valueDisplayId: 'lod-max-high-slots-value',
                formatDisplay: (v) => `${v}`,
                onInput: (value) => {
                    this.updateSetting('lodMaxHighSlots', value)
                    this.updateVramEstimate(value)
                }
            },
            {
                sliderId: 'lod-high-ratio',
                valueDisplayId: 'lod-high-ratio-value',
                formatDisplay: (v) => `${Math.round(v * 100)}%`,
                onInput: (value) => {
                    this.updateSetting('lodHighReductionRatio', value)
                    this.updateHighDimensions(value)
                    this.updateVramEstimate(this.appSettings.getSetting('lodMaxHighSlots'))
                }
            },
            {
                sliderId: 'lod-med-ratio',
                valueDisplayId: 'lod-med-ratio-value',
                formatDisplay: (v) => `${Math.round(v * 100)}%`,
                onInput: (value) => {
                    this.updateSetting('lodMedReductionRatio', value)
                    this.updateMedDimensions(value)
                }
            },
            {
                sliderId: 'pixel-ratio-scale',
                valueDisplayId: 'pixel-ratio-value',
                formatDisplay: (v) => v.toFixed(2),
                onInput: (value) => this.updateSetting('pixelRatioScale', value)
            }
        ])
    }

    private attachButtonEvents(): void {
        UIComponentUtils.setupButton(document.body, {
            buttonId: 'reset-graphics-settings',
            onClick: this.resetToDefaults.bind(this)
        })
    }

    // LOD helper methods
    private readonly STEAM_SOURCE_WIDTH = 600
    private readonly STEAM_SOURCE_HEIGHT = 900
    
    private calculateVramEstimate(slots: number, ratio: number): number {
        const width = Math.floor(this.STEAM_SOURCE_WIDTH * ratio)
        const height = Math.floor(this.STEAM_SOURCE_HEIGHT * ratio)
        const bytesPerTexture = width * height * 4 // RGBA
        return Math.round((slots * bytesPerTexture) / (1024 * 1024))
    }
    
    private calculateDimensions(ratio: number): string {
        const width = Math.floor(this.STEAM_SOURCE_WIDTH * ratio)
        const height = Math.floor(this.STEAM_SOURCE_HEIGHT * ratio)
        return `${width}×${height}`
    }
    
    private updateVramEstimate(slots: number): void {
        const ratio = this.appSettings.getSetting('lodHighReductionRatio')
        const vram = this.calculateVramEstimate(slots, ratio)
        const el = document.getElementById('lod-vram-estimate')
        if (el) el.textContent = `(~${vram}MB VRAM)`
    }
    
    private updateHighDimensions(ratio: number): void {
        const el = document.getElementById('lod-high-dimensions')
        if (el) el.textContent = this.calculateDimensions(ratio)
    }
    
    private updateMedDimensions(ratio: number): void {
        const el = document.getElementById('lod-med-dimensions')
        if (el) el.textContent = this.calculateDimensions(ratio)
    }

    private applyQualityPreset(quality: QualityLevel): void {
        if (!this.renderer) {
            console.warn('⚠️ Renderer not available - cannot apply graphics quality preset')
            return
        }

        let shadowMapEnabled = true
        let pixelRatioScale = 1

        switch (quality) {
            case 'low':
                shadowMapEnabled = false
                pixelRatioScale = 1
                break
            case 'medium':
                shadowMapEnabled = true
                pixelRatioScale = 1.5
                break
            case 'high':
                shadowMapEnabled = true
                pixelRatioScale = 2
                break
            case 'ultra':
                shadowMapEnabled = true
                pixelRatioScale = window.devicePixelRatio
                break
        }

        this.renderer.shadowMap.enabled = shadowMapEnabled
        this.renderer.setPixelRatio(pixelRatioScale)

        this.appSettings.updateSettings({ shadowMapEnabled, pixelRatioScale }, EventSource.System)
    }

    private getShadowQualityLabel(quality: number): string {
        switch (quality) {
            case 0: return 'Off'
            case 1: return 'Low'
            case 2: return 'Medium'
            case 3: return 'High'
            case 4: return 'Ultra'
            default: return 'Medium'
        }
    }

    private getSsaoQualityLabel(level: number): string {
        return SSAO_QUALITY_LEVELS[level]?.label ?? SSAO_QUALITY_LEVELS[0].label
    }

    private updateSetting<K extends keyof ApplicationSettings>(
        key: K, 
        value: ApplicationSettings[K]
    ): void {
        this.appSettings.setSetting(key, value, EventSource.UI)
        console.log(`🎨 Graphics setting updated: ${key} = ${value}`)
    }

    private resetToDefaults(): void {
        // Reset all graphics settings to system defaults
        const changes = this.appSettings.resetSettingsToDefaults(
            SettingCategory.Graphics,
            EventSource.UI
        )
        
        this.refreshSettingsDisplay()
        
        // Mark all reload-required controls as changed since values differ from scene
        document.querySelectorAll('[data-requires-reload]').forEach(control => {
            control.setAttribute('data-changed', '')
        })
        
        // Notify that settings changed — AppSettings emits events automatically
        console.log('🎨 Graphics settings reset to defaults')
    }

    onShow(): void {
        this.refreshSettingsDisplay()
        // Store initial values for change detection, then clear any stale changed states
        this.storeAllInitialValues()
        this.clearAllChangedStates()
    }

    onHide(): void {
        // No cleanup needed - settings auto-save on change
    }

    private refreshSettingsDisplay(): void {
        if (!this.container) return
        
        // Update lighting quality select
        const qualityLevelSelect = document.getElementById('quality-level-select') as HTMLSelectElement
        if (qualityLevelSelect) {
            qualityLevelSelect.value = this.appSettings.getSetting('qualityLevel')
        }

        const fullscreenToggle = document.getElementById('fullscreen-enabled') as HTMLInputElement
        if (fullscreenToggle) {
            fullscreenToggle.checked = !!document.fullscreenElement
        }

        const shadowMapToggle = document.getElementById('shadow-map-enabled') as HTMLInputElement
        if (shadowMapToggle) {
            shadowMapToggle.checked = this.appSettings.getSetting('shadowMapEnabled')
        }

        UIComponentUtils.updateSliderValue(
            document.body, 'ssao-quality', 'ssao-quality-value',
            this.appSettings.getSetting('ssaoQuality'),
            (v) => this.getSsaoQualityLabel(v)
        )

        const smaaPresetSelect = document.getElementById('smaa-preset') as HTMLSelectElement
        if (smaaPresetSelect) {
            smaaPresetSelect.value = this.appSettings.getSetting('smaaPreset')
        }

        UIComponentUtils.updateSliderValue(
            document.body, 'pixel-ratio-scale', 'pixel-ratio-value',
            this.appSettings.getSetting('pixelRatioScale'),
            (v) => v.toFixed(2)
        )

        // Update lighting quality select
        const lightingSelect = document.getElementById('lighting-quality') as HTMLSelectElement
        if (lightingSelect) {
            lightingSelect.value = this.appSettings.getSetting('lightingQuality')
        }

        UIComponentUtils.updateSliderValue(
            document.body, 'shadow-quality', 'shadow-quality-value',
            this.appSettings.getSetting('shadowQuality'),
            (v) => this.getShadowQualityLabel(v)
        )

        UIComponentUtils.updateSliderValue(
            document.body, 'ceiling-height', 'ceiling-height-value',
            this.appSettings.getSetting('ceilingHeight'),
            (v) => `${v}m`
        )

        // Update lighting checkbox
        const lightingCheckbox = document.getElementById('enable-lighting') as HTMLInputElement
        if (lightingCheckbox) {
            lightingCheckbox.checked = this.appSettings.getSetting('enableLighting')
        }
        
        // Update debug checkbox
        const debugCheckbox = document.getElementById('show-lighting-debug') as HTMLInputElement
        if (debugCheckbox) {
            debugCheckbox.checked = this.appSettings.getSetting('showLightingDebug')
        }
        
        // Update ceiling checkbox
        const ceilingCheckbox = document.getElementById('show-ceiling') as HTMLInputElement
        if (ceilingCheckbox) {
            ceilingCheckbox.checked = this.appSettings.getSetting('showCeiling')
        }
        
        UIComponentUtils.updateSliderValue(
            document.body, 'lod-high-distance', 'lod-high-distance-value',
            this.appSettings.getSetting('lodHighDistance'),
            (v) => `${v}m`
        )

        UIComponentUtils.updateSliderValue(
            document.body, 'lod-med-distance', 'lod-med-distance-value',
            this.appSettings.getSetting('lodMedDistance'),
            (v) => `${v}m`
        )

        const lodMaxSlots = this.appSettings.getSetting('lodMaxHighSlots')
        UIComponentUtils.updateSliderValue(
            document.body, 'lod-max-high-slots', 'lod-max-high-slots-value',
            lodMaxSlots,
            (v) => `${v}`
        )
        this.updateVramEstimate(lodMaxSlots)

        const lodHighRatio = this.appSettings.getSetting('lodHighReductionRatio')
        UIComponentUtils.updateSliderValue(
            document.body, 'lod-high-ratio', 'lod-high-ratio-value',
            lodHighRatio,
            (v) => `${Math.round(v * 100)}%`
        )
        this.updateHighDimensions(lodHighRatio)

        const lodMedRatio = this.appSettings.getSetting('lodMedReductionRatio')
        UIComponentUtils.updateSliderValue(
            document.body, 'lod-med-ratio', 'lod-med-ratio-value',
            lodMedRatio,
            (v) => `${Math.round(v * 100)}%`
        )
        this.updateMedDimensions(lodMedRatio)
    }

    private async setFullscreenEnabled(enabled: boolean): Promise<void> {
        try {
            if (enabled && !document.fullscreenElement) {
                await document.documentElement.requestFullscreen()
                return
            }

            if (!enabled && document.fullscreenElement) {
                await document.exitFullscreen()
                return
            }
        } catch (error) {
            console.warn('Fullscreen API not supported or failed:', error)
            const fullscreenToggle = document.getElementById('fullscreen-enabled') as HTMLInputElement
            if (fullscreenToggle) {
                fullscreenToggle.checked = !!document.fullscreenElement
            }
        }
    }

    dispose(): void {
    }
}