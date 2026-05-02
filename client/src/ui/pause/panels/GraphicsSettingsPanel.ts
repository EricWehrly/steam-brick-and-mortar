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
import { AppSettings, LIGHTING_QUALITY, SettingCategory, type ApplicationSettings } from '../../../core/AppSettings'
import { EventManager, EventSource } from '../../../core/EventManager'
import { CeilingEventTypes } from '../../../types/InteractionEvents'
import { type CeilingToggleEvent } from '../../../types/LightingEvents'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'

export class GraphicsSettingsPanel extends PauseMenuPanel {
    readonly id = 'graphics-settings'
    readonly title = 'Graphics'
    readonly icon = '🎨'

    private appSettings: AppSettings
    private onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings) {
        super(config)
        this.appSettings = appSettings
    }

    initialize(callbacks: { onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void }): void {
        this.onSettingsChanged = callbacks.onSettingsChanged
    }

    render(): string {
        const lodHighRatio = this.appSettings.getSetting('lodHighReductionRatio')
        const lodMedRatio = this.appSettings.getSetting('lodMedReductionRatio')
        const lodMaxHighSlots = this.appSettings.getSetting('lodMaxHighSlots')
        
        return renderTemplate(graphicsSettingsPanelTemplate, {
            // Renderer quality preset
            qualityLow: this.appSettings.getSetting('qualityLevel') === 'low',
            qualityMedium: this.appSettings.getSetting('qualityLevel') === 'medium',
            qualityHigh: this.appSettings.getSetting('qualityLevel') === 'high',
            qualityUltra: this.appSettings.getSetting('qualityLevel') === 'ultra',

            // Lighting Quality
            lightingQualitySimple: this.appSettings.getSetting('lightingQuality') === LIGHTING_QUALITY.SIMPLE,
            lightingQualityEnhanced: this.appSettings.getSetting('lightingQuality') === LIGHTING_QUALITY.ENHANCED,
            lightingQualityAdvanced: this.appSettings.getSetting('lightingQuality') === LIGHTING_QUALITY.ADVANCED,
            lightingQualityOuch: this.appSettings.getSetting('lightingQuality') === LIGHTING_QUALITY.OUCH_MY_EYES,
            
            // Shadow Settings
            shadowQuality: this.appSettings.getSetting('shadowQuality'),
            shadowQualityLabel: this.getShadowQualityLabel(this.appSettings.getSetting('shadowQuality')),
            
            // Ceiling Height
            ceilingHeight: this.appSettings.getSetting('ceilingHeight'),
            
            // Debug & Testing
            enableLighting: this.appSettings.getSetting('enableLighting'),
            showLightingDebug: this.appSettings.getSetting('showLightingDebug'),
            showCeiling: this.appSettings.getSetting('showCeiling'),
            
            // LOD Settings - Distance thresholds
            lodHighDistance: this.appSettings.getSetting('lodHighDistance'),
            lodMedDistance: this.appSettings.getSetting('lodMedDistance'),
            
            // LOD Settings - VRAM management
            lodMaxHighSlots: lodMaxHighSlots,
            lodVramEstimate: this.calculateVramEstimate(lodMaxHighSlots, lodHighRatio),
            
            // LOD Settings - Texture quality ratios
            lodHighReductionRatio: lodHighRatio,
            lodHighRatioPercent: Math.round(lodHighRatio * 100),
            lodHighDimensions: this.calculateDimensions(lodHighRatio),
            lodMedReductionRatio: lodMedRatio,
            lodMedRatioPercent: Math.round(lodMedRatio * 100),
            lodMedDimensions: this.calculateDimensions(lodMedRatio)
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
            onChange: (quality) => this.updateSetting('qualityLevel', quality)
        })

        UIComponentUtils.setupSelect<ApplicationSettings['lightingQuality']>(document.body, {
            selectId: 'lighting-quality',
            onChange: (quality) => this.updateSetting('lightingQuality', quality)
        })
    }

    private attachCheckboxEvents(): void {
        UIComponentUtils.setupToggles(document.body, [
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
                sliderId: 'ceiling-height',
                valueDisplayId: 'ceiling-height-value',
                formatDisplay: (v) => `${v}m`,
                onChange: (value) => this.updateSetting('ceilingHeight', value)
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

    private updateSetting<K extends keyof ApplicationSettings>(
        key: K, 
        value: ApplicationSettings[K]
    ): void {
        this.appSettings.setSetting(key, value, EventSource.UI)
        this.onSettingsChanged?.({ [key]: value } as Partial<ApplicationSettings>)
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
        
        // Notify that settings changed
        if (Object.keys(changes).length > 0) {
            this.onSettingsChanged?.(changes)
        }
        
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

        // Update lighting quality select
        const lightingSelect = document.getElementById('lighting-quality') as HTMLSelectElement
        if (lightingSelect) {
            lightingSelect.value = this.appSettings.getSetting('lightingQuality')
        }
        
        // Update shadow quality slider
        const shadowQualitySlider = document.getElementById('shadow-quality') as HTMLInputElement
        const shadowQualityValue = document.getElementById('shadow-quality-value') as HTMLElement
        if (shadowQualitySlider && shadowQualityValue) {
            const quality = this.appSettings.getSetting('shadowQuality')
            shadowQualitySlider.value = quality.toString()
            shadowQualityValue.textContent = this.getShadowQualityLabel(quality)
        }
        
        // Update ceiling height slider and display
        const ceilingSlider = document.getElementById('ceiling-height') as HTMLInputElement
        const ceilingValue = document.getElementById('ceiling-height-value') as HTMLSpanElement
        if (ceilingSlider && ceilingValue) {
            const height = this.appSettings.getSetting('ceilingHeight')
            ceilingSlider.value = height.toString()
            ceilingValue.textContent = `${height}m`
        }
        
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
        
        // Update LOD high distance slider
        const lodHighDistanceSlider = document.getElementById('lod-high-distance') as HTMLInputElement
        const lodHighDistanceValue = document.getElementById('lod-high-distance-value') as HTMLSpanElement
        if (lodHighDistanceSlider && lodHighDistanceValue) {
            const distance = this.appSettings.getSetting('lodHighDistance')
            lodHighDistanceSlider.value = distance.toString()
            lodHighDistanceValue.textContent = `${distance}m`
        }
        
        // Update LOD med distance slider
        const lodMedDistanceSlider = document.getElementById('lod-med-distance') as HTMLInputElement
        const lodMedDistanceValue = document.getElementById('lod-med-distance-value') as HTMLSpanElement
        if (lodMedDistanceSlider && lodMedDistanceValue) {
            const distance = this.appSettings.getSetting('lodMedDistance')
            lodMedDistanceSlider.value = distance.toString()
            lodMedDistanceValue.textContent = `${distance}m`
        }
        
        // Update LOD max high slots slider
        const lodMaxSlotsSlider = document.getElementById('lod-max-high-slots') as HTMLInputElement
        const lodMaxSlotsValue = document.getElementById('lod-max-high-slots-value') as HTMLSpanElement
        if (lodMaxSlotsSlider && lodMaxSlotsValue) {
            const slots = this.appSettings.getSetting('lodMaxHighSlots')
            lodMaxSlotsSlider.value = slots.toString()
            lodMaxSlotsValue.textContent = `${slots}`
            this.updateVramEstimate(slots)
        }
        
        // Update LOD high ratio slider
        const lodHighRatioSlider = document.getElementById('lod-high-ratio') as HTMLInputElement
        const lodHighRatioValue = document.getElementById('lod-high-ratio-value') as HTMLSpanElement
        if (lodHighRatioSlider && lodHighRatioValue) {
            const ratio = this.appSettings.getSetting('lodHighReductionRatio')
            lodHighRatioSlider.value = ratio.toString()
            lodHighRatioValue.textContent = `${Math.round(ratio * 100)}%`
            this.updateHighDimensions(ratio)
        }
        
        // Update LOD med ratio slider
        const lodMedRatioSlider = document.getElementById('lod-med-ratio') as HTMLInputElement
        const lodMedRatioValue = document.getElementById('lod-med-ratio-value') as HTMLSpanElement
        if (lodMedRatioSlider && lodMedRatioValue) {
            const ratio = this.appSettings.getSetting('lodMedReductionRatio')
            lodMedRatioSlider.value = ratio.toString()
            lodMedRatioValue.textContent = `${Math.round(ratio * 100)}%`
            this.updateMedDimensions(ratio)
        }
    }

    dispose(): void {
        this.onSettingsChanged = undefined
    }
}