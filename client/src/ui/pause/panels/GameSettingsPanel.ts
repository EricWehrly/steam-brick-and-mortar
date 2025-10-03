/**
 * GameSettingsPanel - Steam-specific settings and configuration
 * 
 * Dedicated panel for Steam-related settings separate from general app settings:
 * - Steam profile management
 * - Game library preferences
 * - Steam API behavior settings
 * - Cache preferences specific to Steam data
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import gameSettingsPanelTemplate from '../../../templates/pause-menu/game-settings-panel.html?raw'
import '../../../styles/pause-menu/game-settings-panel.css'
import { AppSettings } from '../../../core/AppSettings'
import { EventManager, EventSource } from '../../../core/EventManager'
import { SteamEventTypes } from '../../../types/InteractionEvents'

export interface SteamSettings {
    // Steam Profile Settings (autoLoadProfile moved to AppSettings)
    saveProfileHistory: boolean
    defaultSortOrder: 'name' | 'playtime' | 'recent' | 'rating'
    
    // Game Library Display
    showUnplayedGames: boolean
    showHiddenGames: boolean
    minimumPlaytime: number // minutes, 0 = show all
    
    // Performance & Loading
    loadArtworkAutomatically: boolean
    artworkQuality: 'low' | 'medium' | 'high'
    maxConcurrentLoads: number
    
    // Privacy & Data
    cacheGameData: boolean
}

export class GameSettingsPanel extends PauseMenuPanel {
    readonly id = 'game-settings'
    readonly title = 'Game Settings'
    readonly icon = '🎮'

    private appSettings: AppSettings
    private eventManager: EventManager
    private settings: SteamSettings = {
        saveProfileHistory: true,
        defaultSortOrder: 'playtime',
        showUnplayedGames: true,
        showHiddenGames: false,
        minimumPlaytime: 0,
        loadArtworkAutomatically: true,
        artworkQuality: 'medium',
        maxConcurrentLoads: 4,
        cacheGameData: true
    }

    private onSettingsChanged?: (settings: Partial<SteamSettings>) => void

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
        this.appSettings = AppSettings.getInstance()
        this.eventManager = EventManager.getInstance()
        this.loadSettings()
    }

    initialize(callbacks: { onSettingsChanged?: (settings: Partial<SteamSettings>) => void }): void {
        this.onSettingsChanged = callbacks.onSettingsChanged
    }

    render(): string {
        return renderTemplate(gameSettingsPanelTemplate, {
            // Steam Profile settings (auto-load from AppSettings, others from local settings)
            autoLoadProfile: this.appSettings.getSetting('autoLoadProfile'),
            saveProfileHistory: this.settings.saveProfileHistory,
            
            // Game Library sort options
            sortByName: this.settings.defaultSortOrder === 'name',
            sortByPlaytime: this.settings.defaultSortOrder === 'playtime',
            sortByRecent: this.settings.defaultSortOrder === 'recent',
            sortByRating: this.settings.defaultSortOrder === 'rating',
            
            // Game Library display options
            developmentMode: this.appSettings.getSetting('developmentMode'),
            showUnplayedGames: this.settings.showUnplayedGames,
            showHiddenGames: this.settings.showHiddenGames,
            minimumPlaytime: this.settings.minimumPlaytime,
            
            // Artwork & Performance
            loadArtworkAutomatically: this.settings.loadArtworkAutomatically,
            artworkQualityLow: this.settings.artworkQuality === 'low',
            artworkQualityMedium: this.settings.artworkQuality === 'medium',
            artworkQualityHigh: this.settings.artworkQuality === 'high',
            maxConcurrentLoads: this.settings.maxConcurrentLoads,
            
            // Privacy & Data
            cacheGameData: this.settings.cacheGameData
        })
    }

    attachEvents(): void {
        this.attachCheckboxEvents()
        this.attachSelectEvents()
        this.attachInputEvents()
        this.attachButtonEvents()
    }

    private attachCheckboxEvents(): void {
        // Auto-load profile is managed by AppSettings
        const autoLoadToggle = document.getElementById('auto-load-profile') as HTMLInputElement
        if (autoLoadToggle) {
            autoLoadToggle.addEventListener('change', (e) => {
                const checked = (e.target as HTMLInputElement).checked
                this.appSettings.setSetting('autoLoadProfile', checked, EventSource.UI)
                console.log(`🎮 App setting updated: autoLoadProfile = ${checked}`)
            })
        }
        
        // Development mode is managed by AppSettings
        const devModeToggle = document.getElementById('dev-mode-toggle') as HTMLInputElement
        if (devModeToggle) {
            devModeToggle.addEventListener('change', (e) => {
                const checked = (e.target as HTMLInputElement).checked
                this.appSettings.setSetting('developmentMode', checked, EventSource.UI)
                this.handleDevelopmentModeChange(checked)
                console.log(`🎮 App setting updated: developmentMode = ${checked}`)
            })
        }
        
        // Other checkboxes use local settings
        const localCheckboxes = [
            { id: 'save-profile-history', setting: 'saveProfileHistory' as keyof SteamSettings },
            { id: 'show-unplayed', setting: 'showUnplayedGames' as keyof SteamSettings },
            { id: 'show-hidden', setting: 'showHiddenGames' as keyof SteamSettings },
            { id: 'load-artwork-auto', setting: 'loadArtworkAutomatically' as keyof SteamSettings },
            { id: 'cache-game-data', setting: 'cacheGameData' as keyof SteamSettings }
        ]

        localCheckboxes.forEach(({ id, setting }) => {
            const element = document.getElementById(id) as HTMLInputElement
            if (element) {
                element.addEventListener('change', () => {
                    this.updateSetting(setting, element.checked)
                })
            }
        })
    }

    private attachSelectEvents(): void {
        const defaultSortElement = document.getElementById('default-sort-order') as HTMLSelectElement
        if (defaultSortElement) {
            defaultSortElement.addEventListener('change', () => {
                this.updateSetting('defaultSortOrder', defaultSortElement.value as SteamSettings['defaultSortOrder'])
            })
        }

        const artworkQualityElement = document.getElementById('artwork-quality') as HTMLSelectElement
        if (artworkQualityElement) {
            artworkQualityElement.addEventListener('change', () => {
                this.updateSetting('artworkQuality', artworkQualityElement.value as SteamSettings['artworkQuality'])
            })
        }
    }

    private attachInputEvents(): void {
        const minimumPlaytimeElement = document.getElementById('minimum-playtime') as HTMLInputElement
        if (minimumPlaytimeElement) {
            minimumPlaytimeElement.addEventListener('change', () => {
                this.updateSetting('minimumPlaytime', parseInt(minimumPlaytimeElement.value, 10))
            })
        }

        const maxConcurrentElement = document.getElementById('max-concurrent-loads') as HTMLInputElement
        if (maxConcurrentElement) {
            maxConcurrentElement.addEventListener('change', () => {
                this.updateSetting('maxConcurrentLoads', parseInt(maxConcurrentElement.value, 10))
            })
        }
    }

    private attachButtonEvents(): void {
        const resetButton = document.getElementById('reset-game-settings')
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetToDefaults())
        }

        const exportButton = document.getElementById('export-game-settings')
        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportSettings())
        }
    }

    private updateSetting<K extends keyof SteamSettings>(key: K, value: SteamSettings[K]): void {
        this.settings[key] = value
        this.saveSettings()
        
        // Notify callback of the change
        this.onSettingsChanged?.({ [key]: value } as Partial<SteamSettings>)
        

        
        console.log(`🎮 Game setting updated: ${key} = ${value}`)
    }

    private handleDevelopmentModeChange(isEnabled: boolean): void {
        // Emit the dev mode toggle event for SteamWorkflowManager to handle
        this.eventManager.emit(SteamEventTypes.DevModeToggle, {
            isEnabled,
            timestamp: Date.now(),
            source: EventSource.UI
        })
    }

    private resetToDefaults(): void {
        // Reset local Steam settings to defaults
        this.settings = {
            saveProfileHistory: true,
            defaultSortOrder: 'playtime',
            showUnplayedGames: true,
            showHiddenGames: false,
            minimumPlaytime: 0,
            loadArtworkAutomatically: true,
            artworkQuality: 'medium',
            maxConcurrentLoads: 4,
            cacheGameData: true
        }
        
        // Reset AppSettings to defaults as well
        this.appSettings.setSetting('autoLoadProfile', false, EventSource.UI)
        this.appSettings.setSetting('developmentMode', true, EventSource.UI)
        
        this.saveSettings()
        this.refreshSettingsDisplay() // Re-render with default values
        
        console.log('🎮 Game settings reset to defaults')
    }

    private exportSettings(): void {
        const settingsJson = JSON.stringify(this.settings, null, 2)
        const blob = new Blob([settingsJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        
        const a = document.createElement('a')
        a.href = url
        a.download = 'steam-brick-mortar-game-settings.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        console.log('🎮 Game settings exported')
    }

    private loadSettings(): void {
        try {
            const saved = localStorage.getItem('steam-brick-mortar-game-settings')
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) }
            }
        } catch (error) {
            console.warn('Failed to load game settings:', error)
        }
    }

    private saveSettings(): void {
        try {
            localStorage.setItem('steam-brick-mortar-game-settings', JSON.stringify(this.settings))
        } catch (error) {
            console.warn('Failed to save game settings:', error)
        }
    }

    getSettings(): SteamSettings {
        return { ...this.settings }
    }

    updateSettings(newSettings: Partial<SteamSettings>): void {
        this.settings = { ...this.settings, ...newSettings }
        this.saveSettings()
        if (this.isVisible) {
            this.refreshSettingsDisplay()
        }
    }

    onShow(): void {
        this.refreshSettingsDisplay()
    }

    onHide(): void {
        // No cleanup needed - settings auto-save on change
    }

    private refreshSettingsDisplay(): void {
        if (!this.container) return
        
        // Update auto-load checkbox from AppSettings
        const autoLoadElement = document.getElementById('auto-load-profile') as HTMLInputElement
        if (autoLoadElement) {
            autoLoadElement.checked = this.appSettings.getSetting('autoLoadProfile')
        }
        
        // Update development mode checkbox from AppSettings
        const devModeElement = document.getElementById('dev-mode-toggle') as HTMLInputElement
        if (devModeElement) {
            devModeElement.checked = this.appSettings.getSetting('developmentMode')
        }
        
        // Update other checkboxes from local settings
        const localCheckboxes = [
            { id: 'save-profile-history', setting: 'saveProfileHistory' as keyof SteamSettings },
            { id: 'show-unplayed', setting: 'showUnplayedGames' as keyof SteamSettings },
            { id: 'show-hidden', setting: 'showHiddenGames' as keyof SteamSettings },
            { id: 'load-artwork-auto', setting: 'loadArtworkAutomatically' as keyof SteamSettings },
            { id: 'cache-game-data', setting: 'cacheGameData' as keyof SteamSettings }
        ]
        
        localCheckboxes.forEach(({ id, setting }) => {
            const element = document.getElementById(id) as HTMLInputElement
            if (element) {
                element.checked = Boolean(this.settings[setting])
            }
        })
        
        // Update select elements
        const sortOrderSelect = document.getElementById('default-sort-order') as HTMLSelectElement
        if (sortOrderSelect) {
            sortOrderSelect.value = this.settings.defaultSortOrder
        }
        
        const artworkQualitySelect = document.getElementById('artwork-quality') as HTMLSelectElement
        if (artworkQualitySelect) {
            artworkQualitySelect.value = this.settings.artworkQuality
        }
        
        // Update number inputs
        const minimumPlaytimeInput = document.getElementById('minimum-playtime') as HTMLInputElement
        if (minimumPlaytimeInput) {
            minimumPlaytimeInput.value = this.settings.minimumPlaytime.toString()
        }
        
        const maxConcurrentInput = document.getElementById('max-concurrent-loads') as HTMLInputElement
        if (maxConcurrentInput) {
            maxConcurrentInput.value = this.settings.maxConcurrentLoads.toString()
        }
    }

    private refresh(): void {
        if (this.container) {
            this.container.innerHTML = this.render()
            this.attachEvents()
        }
    }

    dispose(): void {
        this.onSettingsChanged = undefined
    }
}
