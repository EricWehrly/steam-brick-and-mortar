/**
 * Display Advanced Panel - Artwork material and shadow contact tuning
 *
 * Provides sub-tab controls for expert-level visual settings:
 * - Artwork PBR roughness / metalness
 * - Fresnel edge lift (intensity and falloff)
 * - Shadow contact grounding (bias / normalBias)
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import displayAdvancedPanelTemplate from '../../../templates/pause-menu/display-advanced-panel.html?raw'
import '../../../styles/pause-menu/settings-components.css'
import { AppSettings, Setting } from '../../../core/AppSettings'
import { EventManager } from '../../../core/EventManager'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'


const DEFAULTS = {
    artworkRoughness: 0.35,
    artworkMetalness: 0.05,
    artworkFresnelLift: 0.15,
    artworkFresnelPower: 4.0,
    shadowContactBias: -0.001,
    shadowContactNormalBias: 0.005,
} as const

export class DisplayAdvancedPanel extends PauseMenuPanel {
    readonly id = 'display-advanced'
    readonly title = 'Advanced'
    readonly icon = '🔬'

    private appSettings: AppSettings

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings) {
        super(config)
        this.appSettings = appSettings
    }

    render(): string {
        const s = this.appSettings
        return renderTemplate(displayAdvancedPanelTemplate, {
            artworkRoughness: s.getSetting('artworkRoughness'),
            artworkRoughnessLabel: s.getSetting('artworkRoughness').toFixed(2),
            artworkMetalness: s.getSetting('artworkMetalness'),
            artworkMetalnessLabel: s.getSetting('artworkMetalness').toFixed(2),
            artworkFresnelLift: s.getSetting('artworkFresnelLift'),
            artworkFresnelLiftLabel: s.getSetting('artworkFresnelLift').toFixed(2),
            artworkFresnelPower: s.getSetting('artworkFresnelPower'),
            artworkFresnelPowerLabel: s.getSetting('artworkFresnelPower').toFixed(1),
            shadowContactBias: s.getSetting('shadowContactBias'),
            shadowContactBiasLabel: s.getSetting('shadowContactBias').toFixed(4),
            shadowContactNormalBias: s.getSetting('shadowContactNormalBias'),
            shadowContactNormalBiasLabel: s.getSetting('shadowContactNormalBias').toFixed(3),
        })
    }

    attachEvents(): void {
        const eventManager = EventManager.getInstance()

        UIComponentUtils.setupSliders(this.container, [
            {
                sliderId: 'artwork-roughness',
                valueDisplayId: 'artwork-roughness-value',
                formatDisplay: (v) => v.toFixed(2),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ArtworkRoughness, value)
                }
            },
            {
                sliderId: 'artwork-metalness',
                valueDisplayId: 'artwork-metalness-value',
                formatDisplay: (v) => v.toFixed(2),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ArtworkMetalness, value)
                }
            },
            {
                sliderId: 'artwork-fresnel-lift',
                valueDisplayId: 'artwork-fresnel-lift-value',
                formatDisplay: (v) => v.toFixed(2),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ArtworkFresnelLift, value)
                }
            },
            {
                sliderId: 'artwork-fresnel-power',
                valueDisplayId: 'artwork-fresnel-power-value',
                formatDisplay: (v) => v.toFixed(1),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ArtworkFresnelPower, value)
                }
            },
            {
                sliderId: 'shadow-contact-bias',
                valueDisplayId: 'shadow-contact-bias-value',
                formatDisplay: (v) => v.toFixed(4),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ShadowContactBias, value)
                }
            },
            {
                sliderId: 'shadow-contact-normal-bias',
                valueDisplayId: 'shadow-contact-normal-bias-value',
                formatDisplay: (v) => v.toFixed(3),
                onInput: (value) => {
                    this.appSettings.setSetting(Setting.ShadowContactNormalBias, value)
                }
            },
        ])

        UIComponentUtils.setupButton(this.container, {
            buttonId: 'reset-display-advanced',
            onClick: this.resetToDefaults.bind(this)
        })
    }

    onShow(): void {}
    onHide(): void {}

    private resetToDefaults(): void {
        const eventManager = EventManager.getInstance()

        this.appSettings.setSetting(Setting.ArtworkRoughness, DEFAULTS.artworkRoughness)
        this.appSettings.setSetting(Setting.ArtworkMetalness, DEFAULTS.artworkMetalness)
        this.appSettings.setSetting(Setting.ArtworkFresnelLift, DEFAULTS.artworkFresnelLift)
        this.appSettings.setSetting(Setting.ArtworkFresnelPower, DEFAULTS.artworkFresnelPower)
        this.appSettings.setSetting(Setting.ShadowContactBias, DEFAULTS.shadowContactBias)
        this.appSettings.setSetting(Setting.ShadowContactNormalBias, DEFAULTS.shadowContactNormalBias)

        // Re-render to sync sliders to reset values
        const container = document.getElementById(this.config.containerId ?? 'pause-menu-content')
        if (container) {
            container.innerHTML = this.render()
            this.attachEvents()
        }
    }
}
