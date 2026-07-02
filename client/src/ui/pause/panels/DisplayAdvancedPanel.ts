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
import { RangeControl } from '../../components/UIComponent'

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
            artworkRoughnessControl: new RangeControl({
                id: 'artwork-roughness',
                label: 'Roughness',
                description: 'Controls how matte vs. glossy the surface reads.',
                min: 0.2,
                max: 0.6,
                step: 0.01,
                value: s.getSetting('artworkRoughness'),
                formatDisplay: (v) => v.toFixed(2),
                trackLabels: ['0.2 (glossy)', '0.6 (matte)']
            }).render(),

            artworkMetalnessControl: new RangeControl({
                id: 'artwork-metalness',
                label: 'Metalness',
                description: 'Adds specular character. Changes apply immediately.',
                min: 0.0,
                max: 0.2,
                step: 0.01,
                value: s.getSetting('artworkMetalness'),
                formatDisplay: (v) => v.toFixed(2),
                trackLabels: ['0.0 (none)', '0.2 (max)']
            }).render(),

            artworkFresnelLiftControl: new RangeControl({
                id: 'artwork-fresnel-lift',
                label: 'Lift',
                description: 'Controls brightness boost intensity.',
                min: 0.0,
                max: 0.3,
                step: 0.01,
                value: s.getSetting('artworkFresnelLift'),
                formatDisplay: (v) => v.toFixed(2),
                trackLabels: ['0.0 (off)', '0.3 (max)']
            }).render(),

            artworkFresnelPowerControl: new RangeControl({
                id: 'artwork-fresnel-power',
                label: 'Power',
                description: 'Controls falloff sharpness.',
                min: 2.0,
                max: 8.0,
                step: 0.1,
                value: s.getSetting('artworkFresnelPower'),
                formatDisplay: (v) => v.toFixed(1),
                trackLabels: ['2.0 (wide)', '8.0 (sharp)']
            }).render(),

            shadowContactBiasControl: new RangeControl({
                id: 'shadow-contact-bias',
                label: 'Bias',
                description: 'More negative pulls shadow contact closer.',
                min: -0.005,
                max: -0.0001,
                step: 0.0001,
                value: s.getSetting('shadowContactBias'),
                formatDisplay: (v) => v.toFixed(4),
                trackLabels: ['−0.005 (tighter)', '−0.0001 (looser)']
            }).render(),

            shadowContactNormalBiasControl: new RangeControl({
                id: 'shadow-contact-normal-bias',
                label: 'Normal Bias',
                description: 'Lower tightens the contact zone. Changes apply immediately.',
                min: 0.0,
                max: 0.03,
                step: 0.001,
                value: s.getSetting('shadowContactNormalBias'),
                formatDisplay: (v) => v.toFixed(3),
                trackLabels: ['0.0 (tight)', '0.03 (loose)']
            }).render()
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
