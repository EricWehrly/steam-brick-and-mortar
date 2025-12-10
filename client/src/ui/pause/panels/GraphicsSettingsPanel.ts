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
import { AppSettings, LIGHTING_QUALITY, type ApplicationSettings } from '../../../core/AppSettings'
import { EventManager, EventSource } from '../../../core/EventManager'
import { CeilingEventTypes, type CeilingToggleEvent } from '../../../types/InteractionEvents'
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
        return renderTemplate(graphicsSettingsPanelTemplate, {
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
            
            // LOD Settings
            lodHighDistance: this.appSettings.getSetting('lodHighDistance')
        })
    }

    attachEvents(): void {
        this.attachSelectEvents()
        this.attachCheckboxEvents()
        this.attachSliderEvents()
        this.attachButtonEvents()
    }

    private attachSelectEvents(): void {
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
                        timestamp: Date.now(),
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
            }
        ])
    }

    private attachButtonEvents(): void {
        UIComponentUtils.setupButton(document.body, {
            buttonId: 'reset-graphics-settings',
            onClick: this.resetToDefaults.bind(this)
        })
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
        // Reset graphics settings to defaults
        this.appSettings.setSetting('lightingQuality', LIGHTING_QUALITY.ENHANCED, EventSource.UI)
        this.appSettings.setSetting('shadowQuality', this.appSettings.getDefaultSetting('shadowQuality'), EventSource.UI)
        this.appSettings.setSetting('ceilingHeight', 3.2, EventSource.UI)
        this.appSettings.setSetting('enableLighting', true, EventSource.UI)
        this.appSettings.setSetting('showLightingDebug', false, EventSource.UI)
        this.appSettings.setSetting('showCeiling', true, EventSource.UI)
        this.appSettings.setSetting('lodHighDistance', 3.0, EventSource.UI)
        
        this.refreshSettingsDisplay()
        
        // Notify that all settings changed
        this.onSettingsChanged?.({
            lightingQuality: LIGHTING_QUALITY.ENHANCED,
            shadowQuality: this.appSettings.getDefaultSetting('shadowQuality'),
            ceilingHeight: 3.2,
            enableLighting: true,
            showLightingDebug: false,
            showCeiling: true,
            lodHighDistance: 3.0
        })
        
        console.log('🎨 Graphics settings reset to defaults')
    }

    onShow(): void {
        this.refreshSettingsDisplay()
    }

    onHide(): void {
        // No cleanup needed - settings auto-save on change
    }

    private refreshSettingsDisplay(): void {
        if (!this.container) return
        
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
    }

    dispose(): void {
        this.onSettingsChanged = undefined
    }
}