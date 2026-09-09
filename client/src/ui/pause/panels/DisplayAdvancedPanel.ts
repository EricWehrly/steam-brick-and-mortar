/**
 * Display Advanced Panel - Artwork material and shadow contact tuning
 *
 * Provides sub-tab controls for expert-level visual settings:
 * - Artwork PBR roughness / metalness
 * - Fresnel edge lift (intensity and falloff)
 * - Shadow contact grounding (bias / normalBias)
 *
 * Rendered from DISPLAY_ADVANCED_SCHEMA (schemas/DisplayAdvancedSchema.ts) rather than hand-built
 * markup, so this panel's controls stay in one place shared with the VR uikit port
 * (VRDisplayAdvancedPanel) - see docs/plans/vr-uikit-menu-migration-plan.md. No standalone .html
 * template - renderSettingsSchemaSections() already produces the only content that varies per
 * panel, so the couple of static wrapper/reset-button lines don't earn a template file of their
 * own (review feedback, 2026-09-09).
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import '../../../styles/pause-menu/settings-components.css'
import { AppSettings } from '../../../core/AppSettings'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { schemaSettingKeys } from '../../settings/SettingsSchema'
import { DISPLAY_ADVANCED_SCHEMA } from '../../settings/schemas/DisplayAdvancedSchema'
import { renderSettingsSchemaSections, schemaSliderConfigs } from '../../settings/SettingsSchemaDomRenderer'

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
        return `<div class="display-advanced-panel">
            <div class="settings-sections">
                ${renderSettingsSchemaSections(DISPLAY_ADVANCED_SCHEMA, this.appSettings)}
                <section class="setting-section">
                    <div class="setting-group">
                        <div class="setting-control">
                            <button id="reset-display-advanced" class="pause-btn secondary">
                                Reset to Defaults
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>`
    }

    attachEvents(): void {
        UIComponentUtils.setupSliders(this.container, schemaSliderConfigs(DISPLAY_ADVANCED_SCHEMA, this.appSettings))

        UIComponentUtils.setupButton(this.container, {
            buttonId: 'reset-display-advanced',
            onClick: this.resetToDefaults.bind(this)
        })
    }

    onShow(): void {}
    onHide(): void {}

    private resetToDefaults(): void {
        this.appSettings.resetSettingsToDefaults(schemaSettingKeys(DISPLAY_ADVANCED_SCHEMA))

        // Re-render to sync sliders to reset values
        const container = document.getElementById(this.config.containerId ?? 'pause-menu-content')
        if (container) {
            container.innerHTML = this.render()
            this.attachEvents()
        }
    }
}
