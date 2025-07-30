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

export interface ApplicationSettings {
    // Performance Settings
    targetFPS: number
    enableVSync: boolean
    qualityLevel: 'low' | 'medium' | 'high' | 'ultra'
    
    // Interface Settings
    showFPS: boolean
    showPerformanceStats: boolean
    hideUIInVR: boolean
    
    // Debug Settings
    enableConsole: boolean
    verboseLogging: boolean
    showDebugInfo: boolean
    
    // General Settings
    autoSave: boolean
    fullscreenOnStart: boolean
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
        return `
            <!-- Application Controls -->
            <div class="app-section">
                <h4>Application Control</h4>
                <div class="control-buttons">
                    <button id="app-resume-btn" class="app-btn primary">
                        <span class="btn-icon">▶️</span>
                        <span class="btn-text">Resume</span>
                        <span class="btn-shortcut">ESC</span>
                    </button>
                </div>
            </div>

            <!-- Performance Settings -->
            <div class="app-section">
                <h4>Performance Settings</h4>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="quality-select">Graphics Quality:</label>
                            <select id="quality-select" class="setting-select">
                                <option value="low" ${this.settings.qualityLevel === 'low' ? 'selected' : ''}>Low</option>
                                <option value="medium" ${this.settings.qualityLevel === 'medium' ? 'selected' : ''}>Medium</option>
                                <option value="high" ${this.settings.qualityLevel === 'high' ? 'selected' : ''}>High</option>
                                <option value="ultra" ${this.settings.qualityLevel === 'ultra' ? 'selected' : ''}>Ultra</option>
                            </select>
                        </div>
                        
                        <div class="setting-item">
                            <label for="target-fps-select">Target FPS:</label>
                            <select id="target-fps-select" class="setting-select">
                                <option value="30" ${this.settings.targetFPS === 30 ? 'selected' : ''}>30 FPS</option>
                                <option value="60" ${this.settings.targetFPS === 60 ? 'selected' : ''}>60 FPS</option>
                                <option value="90" ${this.settings.targetFPS === 90 ? 'selected' : ''}>90 FPS (VR)</option>
                                <option value="120" ${this.settings.targetFPS === 120 ? 'selected' : ''}>120 FPS</option>
                                <option value="144" ${this.settings.targetFPS === 144 ? 'selected' : ''}>144 FPS</option>
                            </select>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="vsync-toggle" ${this.settings.enableVSync ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Enable V-Sync</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Interface Settings -->
                <div class="app-section">
                    <h4>Interface Settings</h4>
                    <div class="settings-grid">
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="show-fps-toggle" ${this.settings.showFPS ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Show FPS Counter</span>
                            </label>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="show-perf-toggle" ${this.settings.showPerformanceStats ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Show Performance Stats</span>
                            </label>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="hide-ui-vr-toggle" ${this.settings.hideUIInVR ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Hide UI in VR Mode</span>
                            </label>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="fullscreen-start-toggle" ${this.settings.fullscreenOnStart ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Fullscreen on Start</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Debug Settings (for development) -->
                <div class="app-section debug-section">
                    <h4>Debug & Development</h4>
                    <div class="settings-grid">
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="enable-console-toggle" ${this.settings.enableConsole ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Enable Console</span>
                            </label>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="verbose-logging-toggle" ${this.settings.verboseLogging ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Verbose Logging</span>
                            </label>
                        </div>
                        
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="show-debug-toggle" ${this.settings.showDebugInfo ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Show Debug Info</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="debug-actions">
                        <button id="open-console-btn" class="debug-btn">
                            <span class="btn-icon">💻</span>
                            Open Developer Console
                        </button>
                        <button id="export-logs-btn" class="debug-btn">
                            <span class="btn-icon">📋</span>
                            Export Debug Logs
                        </button>
                    </div>
                </div>

                <!-- General Settings -->
                <div class="app-section">
                    <h4>General Settings</h4>
                    <div class="settings-grid">
                        <div class="setting-item checkbox-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="auto-save-toggle" ${this.settings.autoSave ? 'checked' : ''}>
                                <span class="checkmark"></span>
                                <span class="label-text">Auto-save Settings</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="general-actions">
                        <button id="reset-settings-btn" class="action-btn warning">
                            <span class="btn-icon">🔄</span>
                            Reset to Defaults
                        </button>
                        <button id="export-settings-btn" class="action-btn">
                            <span class="btn-icon">📁</span>
                            Export Settings
                        </button>
                        <button id="import-settings-btn" class="action-btn">
                            <span class="btn-icon">📂</span>
                            Import Settings
                        </button>
                    </div>
                </div>

            <style>
                .pause-menu-panel {
                    padding: 20px;
                    max-height: 70vh;
                    overflow-y: auto;
                }

                    .panel-header {
                        margin-bottom: 24px;
                        text-align: center;
                    }

                    .panel-header h3 {
                        margin: 0 0 8px 0;
                        color: #fff;
                        font-size: 1.4em;
                    }

                    .panel-header p {
                        margin: 0;
                        color: #aaa;
                        font-size: 0.9em;
                    }

                    .app-section {
                        margin-bottom: 24px;
                        padding-bottom: 20px;
                        border-bottom: 1px solid #333;
                    }

                    .app-section:last-child {
                        border-bottom: none;
                        margin-bottom: 0;
                    }

                    .app-section h4 {
                        margin: 0 0 16px 0;
                        color: #fff;
                        font-size: 1.1em;
                        font-weight: 600;
                    }

                    .control-buttons {
                        display: flex;
                        gap: 12px;
                        flex-wrap: wrap;
                    }

                    .app-btn {
                        flex: 1;
                        min-width: 120px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px 16px;
                        border: 1px solid #444;
                        border-radius: 8px;
                        color: #fff;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        position: relative;
                    }

                    .app-btn.primary {
                        background: linear-gradient(135deg, #2a5470 0%, #1e3a52 100%);
                        border-color: #3d6b8a;
                    }

                    .app-btn.secondary {
                        background: linear-gradient(135deg, #444 0%, #2a2a2a 100%);
                        border-color: #555;
                    }

                    .app-btn.warning {
                        background: linear-gradient(135deg, #8b4513 0%, #654321 100%);
                        border-color: #a0522d;
                    }

                    .app-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    }

                    .app-btn.primary:hover {
                        background: linear-gradient(135deg, #326082 0%, #23435f 100%);
                        border-color: #4a7fa3;
                    }

                    .app-btn.secondary:hover {
                        background: linear-gradient(135deg, #555 0%, #333 100%);
                        border-color: #666;
                    }

                    .app-btn.warning:hover {
                        background: linear-gradient(135deg, #a0522d 0%, #734a26 100%);
                        border-color: #cd853f;
                    }

                    .btn-icon {
                        font-size: 1.1em;
                    }

                    .btn-shortcut {
                        position: absolute;
                        top: 4px;
                        right: 6px;
                        font-size: 0.7em;
                        color: #aaa;
                        background: rgba(0, 0, 0, 0.3);
                        padding: 2px 4px;
                        border-radius: 3px;
                    }

                    .settings-grid {
                        display: grid;
                        gap: 16px;
                    }

                    .setting-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                    }

                    .setting-item label:not(.checkbox-label) {
                        color: #ccc;
                        font-size: 0.9em;
                        min-width: 120px;
                    }

                    .setting-select {
                        background: #333;
                        border: 1px solid #555;
                        color: #fff;
                        padding: 8px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        min-width: 120px;
                    }

                    .setting-select:focus {
                        outline: none;
                        border-color: #2a5470;
                        box-shadow: 0 0 0 2px rgba(42, 84, 112, 0.3);
                    }

                    .checkbox-item {
                        justify-content: flex-start;
                    }

                    .checkbox-label {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        cursor: pointer;
                        user-select: none;
                        color: #ccc;
                        font-size: 0.9em;
                    }

                    .checkbox-label input[type="checkbox"] {
                        display: none;
                    }

                    .checkmark {
                        width: 18px;
                        height: 18px;
                        border: 2px solid #555;
                        border-radius: 4px;
                        position: relative;
                        transition: all 0.2s ease;
                    }

                    .checkbox-label input:checked + .checkmark {
                        background: #2a5470;
                        border-color: #3d6b8a;
                    }

                    .checkmark::after {
                        content: '';
                        position: absolute;
                        left: 4px;
                        top: 1px;
                        width: 6px;
                        height: 10px;
                        border: solid #fff;
                        border-width: 0 2px 2px 0;
                        transform: rotate(45deg);
                        opacity: 0;
                        transition: opacity 0.2s ease;
                    }

                    .checkbox-label input:checked + .checkmark::after {
                        opacity: 1;
                    }

                    .debug-section {
                        border: 1px solid #444;
                        border-radius: 8px;
                        padding: 16px;
                        background: rgba(255, 255, 255, 0.02);
                    }

                    .debug-actions,
                    .general-actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 16px;
                        flex-wrap: wrap;
                    }

                    .debug-btn,
                    .action-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid #444;
                        border-radius: 6px;
                        color: #ccc;
                        font-size: 0.85em;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }

                    .debug-btn:hover,
                    .action-btn:hover {
                        background: rgba(255, 255, 255, 0.15);
                        border-color: #666;
                        color: #fff;
                    }

                    .action-btn.warning {
                        background: rgba(139, 69, 19, 0.3);
                        border-color: #8b4513;
                        color: #cd853f;
                    }

                    .action-btn.warning:hover {
                        background: rgba(139, 69, 19, 0.5);
                        border-color: #a0522d;
                        color: #daa520;
                    }

                    @media (max-width: 600px) {
                        .control-buttons {
                            flex-direction: column;
                        }
                        
                        .app-btn {
                            min-width: auto;
                        }
                        
                        .debug-actions,
                        .general-actions {
                            flex-direction: column;
                        }
                        
                        .debug-btn,
                        .action-btn {
                            justify-content: center;
                        }
                    }
                </style>
        `
    }

    public attachEvents(): void {
        // Application control buttons
        const resumeBtn = this.container?.querySelector('#app-resume-btn')

        resumeBtn?.addEventListener('click', () => this.resume())

        // Performance settings
        const qualitySelect = this.container?.querySelector('#quality-select') as HTMLSelectElement
        const targetFpsSelect = this.container?.querySelector('#target-fps-select') as HTMLSelectElement
        const vsyncToggle = this.container?.querySelector('#vsync-toggle') as HTMLInputElement

        qualitySelect?.addEventListener('change', (e) => {
            this.updateSetting('qualityLevel', (e.target as HTMLSelectElement).value as ApplicationSettings['qualityLevel'])
        })

        targetFpsSelect?.addEventListener('change', (e) => {
            this.updateSetting('targetFPS', parseInt((e.target as HTMLSelectElement).value))
        })

        vsyncToggle?.addEventListener('change', (e) => {
            this.updateSetting('enableVSync', (e.target as HTMLInputElement).checked)
        })

        // Interface settings
        const showFpsToggle = this.container?.querySelector('#show-fps-toggle') as HTMLInputElement
        const showPerfToggle = this.container?.querySelector('#show-perf-toggle') as HTMLInputElement
        const hideUiVrToggle = this.container?.querySelector('#hide-ui-vr-toggle') as HTMLInputElement
        const fullscreenStartToggle = this.container?.querySelector('#fullscreen-start-toggle') as HTMLInputElement

        showFpsToggle?.addEventListener('change', (e) => {
            this.updateSetting('showFPS', (e.target as HTMLInputElement).checked)
        })

        showPerfToggle?.addEventListener('change', (e) => {
            this.updateSetting('showPerformanceStats', (e.target as HTMLInputElement).checked)
        })

        hideUiVrToggle?.addEventListener('change', (e) => {
            this.updateSetting('hideUIInVR', (e.target as HTMLInputElement).checked)
        })

        fullscreenStartToggle?.addEventListener('change', (e) => {
            this.updateSetting('fullscreenOnStart', (e.target as HTMLInputElement).checked)
        })

        // Debug settings
        const enableConsoleToggle = this.container?.querySelector('#enable-console-toggle') as HTMLInputElement
        const verboseLoggingToggle = this.container?.querySelector('#verbose-logging-toggle') as HTMLInputElement
        const showDebugToggle = this.container?.querySelector('#show-debug-toggle') as HTMLInputElement

        enableConsoleToggle?.addEventListener('change', (e) => {
            this.updateSetting('enableConsole', (e.target as HTMLInputElement).checked)
        })

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
        const openConsoleBtn = this.container?.querySelector('#open-console-btn')
        const exportLogsBtn = this.container?.querySelector('#export-logs-btn')

        openConsoleBtn?.addEventListener('click', () => this.openConsole())
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

    private openConsole(): void {
        // Open browser developer console
        console.log('🔧 Developer Console Access')
        console.log('Application settings:', this.settings)
        console.log('Use this console for debugging the Steam Brick and Mortar application.')
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
        const targetFpsSelect = this.container?.querySelector('#target-fps-select') as HTMLSelectElement
        
        if (qualitySelect) qualitySelect.value = this.settings.qualityLevel
        if (targetFpsSelect) targetFpsSelect.value = this.settings.targetFPS.toString()
        
        // Update all checkboxes
        const checkboxes = [
            { id: '#vsync-toggle', setting: 'enableVSync' as const },
            { id: '#show-fps-toggle', setting: 'showFPS' as const },
            { id: '#show-perf-toggle', setting: 'showPerformanceStats' as const },
            { id: '#hide-ui-vr-toggle', setting: 'hideUIInVR' as const },
            { id: '#fullscreen-start-toggle', setting: 'fullscreenOnStart' as const },
            { id: '#enable-console-toggle', setting: 'enableConsole' as const },
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
            targetFPS: 60,
            enableVSync: true,
            qualityLevel: 'high',
            
            // Interface Settings
            showFPS: false,
            showPerformanceStats: false,
            hideUIInVR: true,
            
            // Debug Settings
            enableConsole: false,
            verboseLogging: false,
            showDebugInfo: false,
            
            // General Settings
            autoSave: true,
            fullscreenOnStart: false
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
        
        if (settingsObj.targetFPS && (typeof settingsObj.targetFPS !== 'number' || settingsObj.targetFPS < 30 || settingsObj.targetFPS > 144)) {
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
