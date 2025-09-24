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
import { AppSettings, type ApplicationSettings } from '../../../core/AppSettings'
import { EventManager, EventSource } from '../../../core/EventManager'
import { CeilingEventTypes, type CeilingToggleEvent } from '../../../types/InteractionEvents'

export class GraphicsSettingsPanel extends PauseMenuPanel {
    readonly id = 'graphics-settings'
    readonly title = 'Graphics Settings'
    readonly icon = '🎨'

    private appSettings: AppSettings
    private onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.appSettings = AppSettings.getInstance()
    }

    initialize(callbacks: { onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void }): void {
        this.onSettingsChanged = callbacks.onSettingsChanged
    }

    render(): string {
        return renderTemplate(graphicsSettingsPanelTemplate, {
            // Lighting Quality
            lightingQualitySimple: this.appSettings.getSetting('lightingQuality') === 'simple',
            lightingQualityEnhanced: this.appSettings.getSetting('lightingQuality') === 'enhanced',
            lightingQualityAdvanced: this.appSettings.getSetting('lightingQuality') === 'advanced',
            lightingQualityOuch: this.appSettings.getSetting('lightingQuality') === 'ouch-my-eyes',
            
            // Shadow Settings
            enableShadows: this.appSettings.getSetting('enableShadows'),
            
            // Ceiling Height
            ceilingHeight: this.appSettings.getSetting('ceilingHeight'),
            
            // Debug & Testing
            enableLighting: this.appSettings.getSetting('enableLighting'),
            showLightingDebug: this.appSettings.getSetting('showLightingDebug'),
            showCeiling: this.appSettings.getSetting('showCeiling')
        })
    }

    attachEvents(): void {
        this.attachSelectEvents()
        this.attachCheckboxEvents()
        this.attachSliderEvents()
        this.attachButtonEvents()
    }

    private attachSelectEvents(): void {
        const lightingQualitySelect = document.getElementById('lighting-quality') as HTMLSelectElement
        if (lightingQualitySelect) {
            lightingQualitySelect.addEventListener('change', () => {
                const quality = lightingQualitySelect.value as ApplicationSettings['lightingQuality']
                this.updateSetting('lightingQuality', quality)
            })
        }
    }

    private attachCheckboxEvents(): void {
        const shadowsCheckbox = document.getElementById('enable-shadows') as HTMLInputElement
        if (shadowsCheckbox) {
            shadowsCheckbox.addEventListener('change', () => {
                this.updateSetting('enableShadows', shadowsCheckbox.checked)
            })
        }

        const lightingCheckbox = document.getElementById('enable-lighting') as HTMLInputElement
        if (lightingCheckbox) {
            lightingCheckbox.addEventListener('change', () => {
                this.updateSetting('enableLighting', lightingCheckbox.checked)
            })
        }

        const debugCheckbox = document.getElementById('show-lighting-debug') as HTMLInputElement
        if (debugCheckbox) {
            debugCheckbox.addEventListener('change', () => {
                this.updateSetting('showLightingDebug', debugCheckbox.checked)
            })
        }

        const ceilingCheckbox = document.getElementById('show-ceiling') as HTMLInputElement
        if (ceilingCheckbox) {
            ceilingCheckbox.addEventListener('change', () => {
                this.updateSetting('showCeiling', ceilingCheckbox.checked)
                
                // Emit ceiling toggle event
                const ceilingEvent: CeilingToggleEvent = {
                    visible: ceilingCheckbox.checked,
                    timestamp: Date.now(),
                    source: EventSource.UI
                }
                EventManager.getInstance().emit(CeilingEventTypes.Toggle, ceilingEvent)
            })
        }
    }

    private attachSliderEvents(): void {
        const ceilingHeightSlider = document.getElementById('ceiling-height') as HTMLInputElement
        const ceilingHeightValue = document.getElementById('ceiling-height-value') as HTMLSpanElement

        if (ceilingHeightSlider && ceilingHeightValue) {
            // Update display value as user drags
            ceilingHeightSlider.addEventListener('input', () => {
                ceilingHeightValue.textContent = `${ceilingHeightSlider.value}m`
            })

            // Apply setting when user finishes dragging
            ceilingHeightSlider.addEventListener('change', () => {
                const height = parseFloat(ceilingHeightSlider.value)
                this.updateSetting('ceilingHeight', height)
            })
        }
    }

    private attachButtonEvents(): void {
        const resetButton = document.getElementById('reset-graphics-settings')
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetToDefaults())
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
        this.appSettings.setSetting('lightingQuality', 'enhanced', EventSource.UI)
        this.appSettings.setSetting('enableShadows', true, EventSource.UI)
        this.appSettings.setSetting('ceilingHeight', 3.2, EventSource.UI)
        this.appSettings.setSetting('enableLighting', true, EventSource.UI)
        this.appSettings.setSetting('showLightingDebug', false, EventSource.UI)
        this.appSettings.setSetting('showCeiling', true, EventSource.UI)
        
        this.refreshSettingsDisplay()
        
        // Notify that all settings changed
        this.onSettingsChanged?.({
            lightingQuality: 'enhanced',
            enableShadows: true,
            ceilingHeight: 3.2,
            enableLighting: true,
            showLightingDebug: false,
            showCeiling: true
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
        
        // Update shadows checkbox
        const shadowsCheckbox = document.getElementById('enable-shadows') as HTMLInputElement
        if (shadowsCheckbox) {
            shadowsCheckbox.checked = this.appSettings.getSetting('enableShadows')
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
    }

    dispose(): void {
        this.onSettingsChanged = undefined
    }
}