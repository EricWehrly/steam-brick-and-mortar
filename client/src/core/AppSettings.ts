/**
 * Application Settings Service
 * 
 * Centralized settings management that provides:
 * - Singleton access to application settings
 * - localStorage persistence
 * - Type-safe setting access and updates
 * - Event-driven change notifications
 * 
 * This service is separate from UI concerns - UI components use this service
 * but core application logic can access settings directly without going through UI layers.
 */

import { EventManager, EventSource } from './EventManager'

// Lighting Quality Constants
export const LIGHTING_QUALITY = {
    SIMPLE: 'simple',
    ENHANCED: 'enhanced', 
    ADVANCED: 'advanced',
    OUCH_MY_EYES: 'ouch-my-eyes'
} as const

export type LightingQuality = typeof LIGHTING_QUALITY[keyof typeof LIGHTING_QUALITY]

export interface ApplicationSettings {
    // Performance Settings
    qualityLevel: 'low' | 'medium' | 'high' | 'ultra'
    
    // Graphics Settings
    lightingQuality: LightingQuality
    shadowQuality: number // 0=off, 1=low, 2=medium, 3=high, 4=ultra
    ceilingHeight: number
    enableLighting: boolean
    showLightingDebug: boolean
    showCeiling: boolean
    
    // Interface Settings
    showFPS: boolean
    showPerformanceStats: boolean
    hideUIInVR: boolean
    
    // Debug Settings
    verboseLogging: boolean
    showDebugInfo: boolean
    
    // General Settings
    autoSave: boolean
    
    // Steam Settings (moved from GameSettings for centralization)
    autoLoadProfile: boolean
    developmentMode: boolean // Limit to 20 games for testing
}

export interface SettingChangedEvent {
    key: keyof ApplicationSettings
    value: ApplicationSettings[keyof ApplicationSettings]
    previousValue: ApplicationSettings[keyof ApplicationSettings]
    timestamp: number
    source: EventSource
}

/**
 * Centralized application settings service
 * Provides type-safe access to settings with localStorage persistence
 */
export class AppSettings {
    private static instance: AppSettings | null = null
    private settings: ApplicationSettings
    private eventManager: EventManager
    private readonly STORAGE_KEY = 'steam-brick-mortar-app-settings'

    private constructor() {
        this.eventManager = EventManager.getInstance()
        this.settings = this.loadSettings()
    }

    /**
     * Get the singleton instance of AppSettings
     */
    public static getInstance(): AppSettings {
        if (!AppSettings.instance) {
            AppSettings.instance = new AppSettings()
        }
        return AppSettings.instance
    }

    /**
     * Get a specific setting value
     */
    public getSetting<K extends keyof ApplicationSettings>(key: K): ApplicationSettings[K] {
        return this.settings[key]
    }

    /**
     * Get the default value for a specific setting
     */
    public getDefaultSetting<K extends keyof ApplicationSettings>(key: K): ApplicationSettings[K] {
        const defaults = this.getDefaultSettings()
        return defaults[key]
    }

    /**
     * Check if a setting is currently at its default value
     */
    public isSettingAtDefault<K extends keyof ApplicationSettings>(key: K): boolean {
        return this.settings[key] === this.getDefaultSetting(key)
    }

    /**
     * Update a specific setting
     */
    public setSetting<K extends keyof ApplicationSettings>(
        key: K,
        value: ApplicationSettings[K],
        source: EventSource = EventSource.System
    ): void {
        const previousValue = this.settings[key]
        
        if (previousValue === value) {
            return // No change
        }

        this.settings[key] = value
        
        // Auto-save if enabled
        if (this.settings.autoSave) {
            this.saveSettings()
        }

        // Emit change event
        this.eventManager.emit<SettingChangedEvent>('app-settings:changed', {
            key,
            value,
            previousValue,
            timestamp: Date.now(),
            source
        })
    }

    /**
     * Update multiple settings at once
     */
    public updateSettings(
        updates: Partial<ApplicationSettings>,
        source: EventSource = EventSource.System
    ): void {
        const changes: Array<SettingChangedEvent> = []
        
        for (const [key, value] of Object.entries(updates)) {
            const typedKey = key as keyof ApplicationSettings
            const previousValue = this.settings[typedKey]
            
            if (previousValue !== value) {
                // Type assertion needed due to TypeScript limitation with dynamic key assignment
                (this.settings as any)[typedKey] = value
                changes.push({
                    key: typedKey,
                    value: value as ApplicationSettings[keyof ApplicationSettings],
                    previousValue,
                    timestamp: Date.now(),
                    source
                })
            }
        }

        // Auto-save if enabled and there were changes
        if (changes.length > 0 && this.settings.autoSave) {
            this.saveSettings()
        }

        // Emit change events for all changes
        changes.forEach(change => {
            this.eventManager.emit<SettingChangedEvent>('app-settings:changed', change)
        })
    }

    /**
     * Get a copy of all current settings
     */
    public getAllSettings(): ApplicationSettings {
        return { ...this.settings }
    }

    /**
     * Reset settings to defaults
     */
    public resetToDefaults(source: EventSource = EventSource.UI): void {
        const oldSettings = { ...this.settings }
        this.settings = this.getDefaultSettings()
        this.saveSettings()

        // Emit events for all changed settings
        for (const [key, value] of Object.entries(this.settings)) {
            const typedKey = key as keyof ApplicationSettings
            const previousValue = oldSettings[typedKey]
            
            if (previousValue !== value) {
                this.eventManager.emit<SettingChangedEvent>('app-settings:changed', {
                    key: typedKey,
                    value: value as ApplicationSettings[keyof ApplicationSettings],
                    previousValue,
                    timestamp: Date.now(),
                    source
                })
            }
        }
    }

    /**
     * Force save settings to localStorage
     */
    public saveSettings(): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings))
        } catch (error) {
            console.error('Failed to save settings:', error)
        }
    }

    /**
     * Validate and import settings from an external source
     */
    public importSettings(
        importedSettings: unknown,
        source: EventSource = EventSource.UI
    ): boolean {
        if (!this.validateSettings(importedSettings)) {
            return false
        }

        const validSettings = importedSettings as Partial<ApplicationSettings>
        const mergedSettings = { ...this.getDefaultSettings(), ...validSettings }
        
        this.updateSettings(mergedSettings, source)
        return true
    }

    /**
     * Export settings as JSON string
     */
    public exportSettings(): string {
        return JSON.stringify(this.settings, null, 2)
    }

    private loadSettings(): ApplicationSettings {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY)
            if (saved) {
                const parsed = JSON.parse(saved)
                return { ...this.getDefaultSettings(), ...parsed }
            }
        } catch (error) {
            console.warn('Failed to load settings:', error)
        }
        
        return this.getDefaultSettings()
    }

    private getDefaultSettings(): ApplicationSettings {
        return {
            // Performance Settings
            qualityLevel: 'high',
            
            // Graphics Settings
            lightingQuality: LIGHTING_QUALITY.ENHANCED,
            shadowQuality: 2, // Medium shadows by default
            ceilingHeight: 3.2,
            enableLighting: true,
            showLightingDebug: false,
            showCeiling: true,
            
            // Interface Settings
            showFPS: false,
            showPerformanceStats: false,
            hideUIInVR: true,
            
            // Debug Settings
            verboseLogging: false,
            showDebugInfo: false,
            
            // General Settings
            autoSave: true,
            
            // Steam Settings  
            autoLoadProfile: false,
            developmentMode: true // Default to enabled for safer testing
        }
    }

    private validateSettings(settings: unknown): settings is Partial<ApplicationSettings> {
        if (typeof settings !== 'object' || settings === null) return false
        
        const settingsObj = settings as Record<string, unknown>
        
        // Validate specific fields if present
        if (settingsObj.qualityLevel && !['low', 'medium', 'high', 'ultra'].includes(settingsObj.qualityLevel as string)) {
            return false
        }
        
        // Validate boolean fields
        const booleanFields = ['showFPS', 'showPerformanceStats', 'hideUIInVR', 'verboseLogging', 'showDebugInfo', 'autoSave', 'autoLoadProfile', 'developmentMode']
        for (const field of booleanFields) {
            if (settingsObj[field] !== undefined && typeof settingsObj[field] !== 'boolean') {
                return false
            }
        }
        
        return true
    }

    /**
     * Dispose of the settings service (for testing)
     */
    public static dispose(): void {
        if (AppSettings.instance) {
            // Save final state before disposal
            AppSettings.instance.saveSettings()
            AppSettings.instance = null
        }
    }
}