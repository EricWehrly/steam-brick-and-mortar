/**
 * Application Panel for Pause Menu
 * 
 * Provides application-level controls and settings:
 * - Resume application control
 * - Performance and graphics settings
 * - User preferences and interface options
 * - Debug and development tools
 * 
 * Central hub for all non-Steam related application configuration.
 * 
 * This panel serves as a UI representation of the AppSettings service,
 * displaying current settings and allowing user interaction to modify them.
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import '../../../styles/pause-menu/application-panel.css'
import { renderTemplate } from '../../../utils/TemplateEngine'
import applicationPanelTemplate from '../../../templates/pause-menu/application-panel.html?raw'
import { ToastManager } from '../../ToastManager'
import { AppSettings, type ApplicationSettings } from '../../../core/AppSettings'
import { EventSource } from '../../../core/EventManager'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import type { EventManager } from '../../../core/EventManager'

export class ApplicationPanel extends PauseMenuPanel {
    public readonly id = 'application'
    public readonly title = 'Application'
    public readonly icon = '⚙️'
    
    private appSettings: AppSettings
    private onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings, _eventManager: EventManager) {
        super(config)
        this.appSettings = appSettings
    }

    /**
     * Initialize with application control callbacks
     */
    public initialize(callbacks: {
        onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void
    }): void {
        this.onSettingsChanged = callbacks.onSettingsChanged
    }

    public render(): string {
        const currentSettings = this.appSettings.getAllSettings()
        return renderTemplate(applicationPanelTemplate, {
            // Checkbox states
            showFPS: currentSettings.showFPS,
            showPerformanceStats: currentSettings.showPerformanceStats,
            hideUIInVR: currentSettings.hideUIInVR,
            verboseLogging: currentSettings.verboseLogging,
            showDebugInfo: currentSettings.showDebugInfo,
            autoSave: currentSettings.autoSave
        })
    }

    public attachEvents(): void {
        UIComponentUtils.setupButtons(this.container, [
            { buttonId: 'app-resume-btn', onClick: this.resume.bind(this) },
            { buttonId: 'app-fullscreen-btn', onClick: this.toggleFullscreen.bind(this) },
            { buttonId: 'export-logs-btn', onClick: this.exportLogs.bind(this) },
            { buttonId: 'reset-settings-btn', onClick: this.resetSettings.bind(this) },
            { buttonId: 'export-settings-btn', onClick: this.exportSettings.bind(this) },
            { buttonId: 'import-settings-btn', onClick: this.importSettings.bind(this) }
        ])

        UIComponentUtils.setupToggles(this.container, [
            {
                toggleId: 'show-fps-toggle',
                onChange: (checked) => this.updateSetting('showFPS', checked)
            },
            {
                toggleId: 'show-perf-toggle',
                onChange: (checked) => this.updateSetting('showPerformanceStats', checked)
            },
            {
                toggleId: 'hide-ui-vr-toggle',
                onChange: (checked) => this.updateSetting('hideUIInVR', checked)
            },
            {
                toggleId: 'verbose-logging-toggle',
                onChange: (checked) => this.updateSetting('verboseLogging', checked)
            },
            {
                toggleId: 'show-debug-toggle',
                onChange: (checked) => this.updateSetting('showDebugInfo', checked)
            },
            {
                toggleId: 'auto-save-toggle',
                onChange: (checked) => this.updateSetting('autoSave', checked)
            }
        ])
    }

    public onShow(): void {
        // Update settings display when panel is shown
        this.refreshSettingsDisplay()
    }
    public onHide(): void {

    }

    private resume(): void {
        // Close the pause menu - emit event that parent can listen to
        this.container?.dispatchEvent(new CustomEvent('pause-menu-close', { bubbles: true }))
    }

    private toggleFullscreen(): void {
        // TODO: Consider moving this fullscreen functionality to the main pause menu header
        // for better accessibility and more prominent placement
        try {
            if (!document.fullscreenElement) {
                // Enter fullscreen
                document.documentElement.requestFullscreen().catch((err) => {
                    console.warn('Failed to enter fullscreen:', err)
                })
            } else {
                // Exit fullscreen
                document.exitFullscreen().catch((err) => {
                    console.warn('Failed to exit fullscreen:', err)
                })
            }
        } catch (error) {
            console.warn('Fullscreen API not supported or failed:', error)
        }
    }

    private updateSetting<K extends keyof ApplicationSettings>(
        key: K,
        value: ApplicationSettings[K]
    ): void {
        this.appSettings.setSetting(key, value, EventSource.UI)
        
        // Notify of settings change
        this.onSettingsChanged?.({ [key]: value })
    }

    private exportLogs(): void {
        // TODO: Implement log export functionality
        const currentSettings = this.appSettings.getAllSettings()
        const logs = {
            timestamp: new Date().toISOString(),
            settings: currentSettings,
            userAgent: navigator.userAgent,
            url: window.location.href
        }
        
        const dataStr = JSON.stringify(logs, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        
        const link = document.createElement('a')
        link.href = url
        link.download = `steam-brick-mortar-logs-${Date.now()}.json`
        link.click()
        
        URL.revokeObjectURL(url)
    }

    private resetSettings(): void {
        if (window.confirm('Are you sure you want to reset all settings to defaults?\n\nThis cannot be undone.')) {
            this.appSettings.resetToDefaults(EventSource.UI)
            this.refreshSettingsDisplay()
            
            // Notify of complete settings reset
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

    // TODO: replace 'alert's with toast messages
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
                    
                    // Use AppSettings validation and import
                    if (this.appSettings.importSettings(importedSettings, EventSource.UI)) {
                        this.refreshSettingsDisplay()
                        
                        // Notify of settings import
                        const currentSettings = this.appSettings.getAllSettings()
                        this.onSettingsChanged?.(currentSettings)
                        
                        ToastManager.success('Settings imported successfully!')
                    } else {
                        ToastManager.error('Invalid settings file format.')
                    }
                } catch (error) {
                    console.error('Failed to import settings:', error)
                    ToastManager.error('Failed to import settings. Please check the file format.')
                }
            }
            
            reader.readAsText(file)
        }
        
        input.click()
    }

    private refreshSettingsDisplay(): void {
        // Update all form elements to reflect current settings
        const currentSettings = this.appSettings.getAllSettings()
        
        // Update all checkboxes
        const checkboxes = [
            { id: '#show-fps-toggle', setting: 'showFPS' as const },
            { id: '#show-perf-toggle', setting: 'showPerformanceStats' as const },
            { id: '#hide-ui-vr-toggle', setting: 'hideUIInVR' as const },
            { id: '#verbose-logging-toggle', setting: 'verboseLogging' as const },
            { id: '#show-debug-toggle', setting: 'showDebugInfo' as const },
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

    public dispose(): void {
        // No need to manually save - AppSettings handles persistence automatically
        super.dispose()
    }
}
