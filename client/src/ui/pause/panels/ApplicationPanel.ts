/**
 * Application Panel for Pause Menu
 * 
 * Provides application-level controls and settings:
 * - Resume application control
 * - User preferences and interface options
 * - General application configuration (auto-save)
 * 
 * Central hub for all application-level settings not related to graphics/performance.
 * 
 * This panel serves as a UI representation of the AppSettings service,
 * displaying current settings and allowing user interaction to modify them.
 * 
 * Note: Performance/debug display toggles (Show FPS, Show Performance Stats) have been
 * moved to the Debug panel. VR settings (Hide UI in VR Mode) are commented out and will
 * be moved to a future "VR" tab under the Display tabgroup in Act 3.
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import '../../../styles/pause-menu/application-panel.css'
import { renderTemplate } from '../../../utils/TemplateEngine'
import applicationPanelTemplate from '../../../templates/pause-menu/application-panel.html?raw'
import { AppSettings, type ApplicationSettings } from '../../../core/AppSettings'
import { EventSource } from '../../../core/EventManager'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { Logger } from '../../../utils/Logger'
import type { EventManager } from '../../../core/EventManager'

export class ApplicationPanel extends PauseMenuPanel {
    private static readonly logger = Logger.createLogFunctions(ApplicationPanel.name)

    public readonly id = 'application'
    public readonly title = 'Application'
    public readonly icon = '⚙️'
    
    private appSettings: AppSettings
    private onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings, _eventManager: EventManager) {
        super(config)
        this.appSettings = appSettings
    }

    public render(): string {
        const currentSettings = this.appSettings.getAllSettings()
        return renderTemplate(applicationPanelTemplate, {
            autoSave: currentSettings.autoSave
        })
    }

    public attachEvents(): void {
        UIComponentUtils.setupButtons(this.container, [
            { buttonId: 'reset-settings-btn', onClick: this.resetSettings.bind(this) },
            { buttonId: 'export-settings-btn', onClick: this.exportSettings.bind(this) },
            { buttonId: 'import-settings-btn', onClick: this.importSettings.bind(this) }
        ])

        UIComponentUtils.setupToggles(this.container, [
            {
                toggleId: 'auto-save-toggle',
                onChange: (checked) => this.updateSetting('autoSave', checked)
            }
        ])
    }

    public onShow(): void {
        this.refreshSettingsDisplay()
    }
    public onHide(): void {

    }

    private updateSetting<K extends keyof ApplicationSettings>(
        key: K,
        value: ApplicationSettings[K]
    ): void {
        this.appSettings.setSetting(key, value, EventSource.UI)
        this.onSettingsChanged?.({ [key]: value })
    }

    private resetSettings(): void {
        if (window.confirm('Are you sure?\n\nReset all settings to defaults. This cannot be undone.')) {
            this.appSettings.resetToDefaults(EventSource.UI)
            this.refreshSettingsDisplay()
            const currentSettings = this.appSettings.getAllSettings()
            this.onSettingsChanged?.(currentSettings)
        }
    }

    private exportSettings(): void {
        const dataStr = this.appSettings.exportSettings()
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        
        const link = document.createElement('a')
        link.href = url
        link.download = `steam-brick-mortar-settings-${Date.now()}.json`
        link.click()
        
        URL.revokeObjectURL(url)
    }

    // TODO: Replace alerts with a non-blocking panel-level status affordance.
    private importSettings(): void {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return
            
            const reader = new FileReader()
            reader.onload = (event) => {
                try {
                    const importedSettings = JSON.parse(event.target?.result as string)

                    if (this.appSettings.importSettings(importedSettings, EventSource.UI)) {
                        this.refreshSettingsDisplay()

                        const currentSettings = this.appSettings.getAllSettings()
                        this.onSettingsChanged?.(currentSettings)

                        ApplicationPanel.logger.info('Settings imported successfully')
                    } else {
                        ApplicationPanel.logger.warn('Invalid settings file format during import')
                    }
                } catch (error) {
                    ApplicationPanel.logger.error('Failed to import settings. Please check the file format.', error)
                }
            }
            
            reader.readAsText(file)
        }
        
        input.click()
    }

    private refreshSettingsDisplay(): void {
        const currentSettings = this.appSettings.getAllSettings()
        const checkboxes = [
            { id: '#auto-save-toggle', setting: 'autoSave' as const }
        ]
        
        checkboxes.forEach(({ id, setting }) => {
            const checkbox = this.container?.querySelector(id) as HTMLInputElement
            if (checkbox) {
                checkbox.checked = currentSettings[setting]
            }
        })
    }

    public getSettings(): ApplicationSettings {
        return this.appSettings.getAllSettings()
    }

    public updateSettings(newSettings: Partial<ApplicationSettings>): void {
        this.appSettings.updateSettings(newSettings, EventSource.UI)
        this.refreshSettingsDisplay()
    }
}
