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
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import '../../../styles/pause-menu/application-panel.css'
import { renderTemplate } from '../../../utils/TemplateEngine'
import applicationPanelTemplate from '../../../templates/pause-menu/application-panel.html?raw'

export interface ApplicationSettings {
    // Performance Settings
    qualityLevel: 'low' | 'medium' | 'high' | 'ultra'
    
    // Interface Settings
    showFPS: boolean
    showPerformanceStats: boolean
    hideUIInVR: boolean
    
    // Debug Settings
    verboseLogging: boolean
    showDebugInfo: boolean
    
    // General Settings
    autoSave: boolean
}

export class ApplicationPanel extends PauseMenuPanel {
    public readonly id = 'application'
    public readonly title = 'Application'
    public readonly icon = '⚙️'
    
    private settings: ApplicationSettings
    private onSettingsChanged?: (settings: Partial<ApplicationSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.settings = this.loadSettings()
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
        return renderTemplate(applicationPanelTemplate, {
            // Quality level selections
            qualityLow: this.settings.qualityLevel === 'low',
            qualityMedium: this.settings.qualityLevel === 'medium',
            qualityHigh: this.settings.qualityLevel === 'high',
            qualityUltra: this.settings.qualityLevel === 'ultra',
            
            // Checkbox states
            showFPS: this.settings.showFPS,
            showPerformanceStats: this.settings.showPerformanceStats,
            hideUIInVR: this.settings.hideUIInVR,
            verboseLogging: this.settings.verboseLogging,
            showDebugInfo: this.settings.showDebugInfo,
            autoSave: this.settings.autoSave
        })
    }

    public attachEvents(): void {
        // Application control buttons
        const resumeBtn = this.container?.querySelector('#app-resume-btn')
        const fullscreenBtn = this.container?.querySelector('#app-fullscreen-btn')
        
        resumeBtn?.addEventListener('click', () => this.resume())
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen())

        // Performance settings
        const qualitySelect = this.container?.querySelector('#quality-select') as HTMLSelectElement
        qualitySelect?.addEventListener('change', (e) => {
            this.updateSetting('qualityLevel', (e.target as HTMLSelectElement).value as ApplicationSettings['qualityLevel'])
        })

        // Interface settings
        const showFpsToggle = this.container?.querySelector('#show-fps-toggle') as HTMLInputElement
        const showPerfToggle = this.container?.querySelector('#show-perf-toggle') as HTMLInputElement
        const hideUiVrToggle = this.container?.querySelector('#hide-ui-vr-toggle') as HTMLInputElement

        showFpsToggle?.addEventListener('change', (e) => {
            this.updateSetting('showFPS', (e.target as HTMLInputElement).checked)
        })

        showPerfToggle?.addEventListener('change', (e) => {
            this.updateSetting('showPerformanceStats', (e.target as HTMLInputElement).checked)
        })

        hideUiVrToggle?.addEventListener('change', (e) => {
            this.updateSetting('hideUIInVR', (e.target as HTMLInputElement).checked)
        })

        // Debug settings
        const verboseLoggingToggle = this.container?.querySelector('#verbose-logging-toggle') as HTMLInputElement
        const showDebugToggle = this.container?.querySelector('#show-debug-toggle') as HTMLInputElement

        verboseLoggingToggle?.addEventListener('change', (e) => {
            this.updateSetting('verboseLogging', (e.target as HTMLInputElement).checked)
        })

        showDebugToggle?.addEventListener('change', (e) => {
            this.updateSetting('showDebugInfo', (e.target as HTMLInputElement).checked)
        })

        // General settings
        const autoSaveToggle = this.container?.querySelector('#auto-save-toggle') as HTMLInputElement
        autoSaveToggle?.addEventListener('change', (e) => {
            this.updateSetting('autoSave', (e.target as HTMLInputElement).checked)
        })

        // Debug action buttons
        const exportLogsBtn = this.container?.querySelector('#export-logs-btn')
        exportLogsBtn?.addEventListener('click', () => this.exportLogs())

        // General action buttons
        const resetSettingsBtn = this.container?.querySelector('#reset-settings-btn')
        const exportSettingsBtn = this.container?.querySelector('#export-settings-btn')
        const importSettingsBtn = this.container?.querySelector('#import-settings-btn')

        resetSettingsBtn?.addEventListener('click', () => this.resetSettings())
        exportSettingsBtn?.addEventListener('click', () => this.exportSettings())
        importSettingsBtn?.addEventListener('click', () => this.importSettings())
    }

    public onShow(): void {
        // Update settings display when panel is shown
        this.refreshSettingsDisplay()
    }

    public onHide(): void {
        // Auto-save settings when panel is hidden
        if (this.settings.autoSave) {
            this.saveSettings()
        }
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
        this.settings[key] = value
        
        // Notify of settings change
        this.onSettingsChanged?.({ [key]: value })
        
        // Auto-save if enabled
        if (this.settings.autoSave) {
            this.saveSettings()
        }
    }

    private exportLogs(): void {
        // TODO: Implement log export functionality
        const logs = {
            timestamp: new Date().toISOString(),
            settings: this.settings,
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
            this.settings = this.getDefaultSettings()
            this.saveSettings()
            this.refreshSettingsDisplay()
            
            // Notify of complete settings reset
            this.onSettingsChanged?.(this.settings)
        }
    }

    private exportSettings(): void {
        const dataStr = JSON.stringify(this.settings, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        
        const link = document.createElement('a')
        link.href = url
        link.download = `steam-brick-mortar-settings-${Date.now()}.json`
        link.click()
        
        URL.revokeObjectURL(url)
    }

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
                    
                    // Validate imported settings
                    if (this.validateSettings(importedSettings)) {
                        this.settings = { ...this.getDefaultSettings(), ...importedSettings }
                        this.saveSettings()
                        this.refreshSettingsDisplay()
                        
                        // Notify of settings import
                        this.onSettingsChanged?.(this.settings)
                        
                        window.alert('Settings imported successfully!')
                    } else {
                        window.alert('Invalid settings file format.')
                    }
                } catch (error) {
                    console.error('Failed to import settings:', error)
                    window.alert('Failed to import settings. Please check the file format.')
                }
            }
            
            reader.readAsText(file)
        }
        
        input.click()
    }

    private refreshSettingsDisplay(): void {
        // Update all form elements to reflect current settings
        const qualitySelect = this.container?.querySelector('#quality-select') as HTMLSelectElement
        if (qualitySelect) qualitySelect.value = this.settings.qualityLevel
        
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
                checkbox.checked = this.settings[setting]
            }
        })
    }

    private loadSettings(): ApplicationSettings {
        try {
            const saved = localStorage.getItem('steam-brick-mortar-app-settings')
            if (saved) {
                const parsed = JSON.parse(saved)
                return { ...this.getDefaultSettings(), ...parsed }
            }
        } catch (error) {
            console.warn('Failed to load settings:', error)
        }
        
        return this.getDefaultSettings()
    }

    private saveSettings(): void {
        try {
            localStorage.setItem('steam-brick-mortar-app-settings', JSON.stringify(this.settings))
        } catch (error) {
            console.error('Failed to save settings:', error)
        }
    }

    private getDefaultSettings(): ApplicationSettings {
        return {
            // Performance Settings
            qualityLevel: 'high',
            
            // Interface Settings
            showFPS: false,
            showPerformanceStats: false,
            hideUIInVR: true,
            
            // Debug Settings
            verboseLogging: false,
            showDebugInfo: false,
            
            // General Settings
            autoSave: true
        }
    }

    private validateSettings(settings: unknown): settings is Partial<ApplicationSettings> {
        // Basic validation of settings structure
        if (typeof settings !== 'object' || settings === null) return false
        
        const settingsObj = settings as Record<string, unknown>
        
        // Validate specific fields if present
        if (settingsObj.qualityLevel && !['low', 'medium', 'high', 'ultra'].includes(settingsObj.qualityLevel as string)) {
            return false
        }
        
        return true
    }

    public getSettings(): ApplicationSettings {
        return { ...this.settings }
    }

    public updateSettings(newSettings: Partial<ApplicationSettings>): void {
        this.settings = { ...this.settings, ...newSettings }
        this.refreshSettingsDisplay()
        
        if (this.settings.autoSave) {
            this.saveSettings()
        }
    }

    public dispose(): void {
        // Save settings on disposal
        if (this.settings.autoSave) {
            this.saveSettings()
        }
        
        super.dispose()
    }
}
