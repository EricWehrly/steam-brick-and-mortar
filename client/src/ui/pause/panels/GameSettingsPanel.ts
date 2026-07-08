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
import { EventManager } from '../../../core/EventManager'
import { EventSource } from '../../../core/EventManager'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { StorePropsEventTypes, SteamEventTypes, type SteamUserClearEvent } from '../../../types/InteractionEvents'

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
    readonly title = 'Game'
    readonly icon = '🎮'

    private appSettings: AppSettings
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

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings) {
        super(config)
        this.appSettings = appSettings
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
            cacheGameData: this.settings.cacheGameData,
            
            // Performance Feature Flags (from AppSettings)
            enableLabels: this.appSettings.getSetting('enableLabels'),
            enableStickers: this.appSettings.getSetting('enableStickers'),
            enableArtwork: this.appSettings.getSetting('enableArtwork'),
            
            // Debug Tools
            showCompassRose: this.appSettings.getSetting('showCompassRose'),
            showShelfIndices: false  // Default off, controlled via event system
        })
    }

    attachEvents(): void {
        this.attachCheckboxEvents()
        this.attachSelectEvents()
        this.attachInputEvents()
        this.attachButtonEvents()
    }

    private attachCheckboxEvents(): void {
        UIComponentUtils.setupToggles(document.body, [
            {
                toggleId: 'auto-load-profile',
                onChange: (checked) => {
                    this.appSettings.setSetting('autoLoadProfile', checked, EventSource.UI)
                    console.log(`🎮 App setting updated: autoLoadProfile = ${checked}`)
                }
            },
            {
                toggleId: 'dev-mode-toggle',
                onChange: (checked) => {
                    this.appSettings.setSetting('developmentMode', checked, EventSource.UI)
                    console.log(`🎮 App setting updated: developmentMode = ${checked}`)
                }
            },
            {
                toggleId: 'save-profile-history',
                onChange: (checked) => this.updateSetting('saveProfileHistory', checked)
            },
            {
                toggleId: 'show-unplayed',
                onChange: (checked) => this.updateSetting('showUnplayedGames', checked)
            },
            {
                toggleId: 'show-hidden',
                onChange: (checked) => this.updateSetting('showHiddenGames', checked)
            },
            {
                toggleId: 'load-artwork-auto',
                onChange: (checked) => this.updateSetting('loadArtworkAutomatically', checked)
            },
            {
                toggleId: 'cache-game-data',
                onChange: (checked) => this.updateSetting('cacheGameData', checked)
            },
            // Performance Feature Flags
            {
                toggleId: 'enable-labels',
                onChange: (checked) => {
                    this.appSettings.setSetting('enableLabels', checked, EventSource.UI)
                    console.log(`⚡ Feature flag updated: enableLabels = ${checked} (restart required)`)
                }
            },
            {
                toggleId: 'enable-stickers',
                onChange: (checked) => {
                    this.appSettings.setSetting('enableStickers', checked, EventSource.UI)
                    console.log(`⚡ Feature flag updated: enableStickers = ${checked} (restart required)`)
                }
            },
            {
                toggleId: 'enable-artwork',
                onChange: (checked) => {
                    this.appSettings.setSetting('enableArtwork', checked, EventSource.UI)
                    console.log(`⚡ Feature flag updated: enableArtwork = ${checked} (restart required)`)
                }
            },
            // Debug Tools
            {
                toggleId: 'show-compass-rose',
                onChange: (checked) => {
                    this.appSettings.setSetting('showCompassRose', checked, EventSource.UI)
                    console.log(`🎮 App setting updated: showCompassRose = ${checked}`)
                }
            },
            {
                toggleId: 'show-shelf-indices',
                onChange: (checked) => {
                    const event = checked ? StorePropsEventTypes.EnableShelfIndices : StorePropsEventTypes.DisableShelfIndices
                    EventManager.getInstance().emit(event, {})
                    console.log(`🔍 Shelf unit indices ${checked ? 'enabled' : 'disabled'}`)
                }
            }
        ])
    }

    private attachSelectEvents(): void {
        UIComponentUtils.setupSelects(document.body, [
            {
                selectId: 'default-sort-order',
                onChange: (value: SteamSettings['defaultSortOrder']) => 
                    this.updateSetting('defaultSortOrder', value)
            },
            {
                selectId: 'artwork-quality',
                onChange: (value: SteamSettings['artworkQuality']) => 
                    this.updateSetting('artworkQuality', value)
            }
        ])
    }

    private attachInputEvents(): void {
        UIComponentUtils.setupInputs(document.body, [
            {
                inputId: 'minimum-playtime',
                parseValue: (v) => parseInt(v, 10),
                onChange: (value) => this.updateSetting('minimumPlaytime', value)
            },
            {
                inputId: 'max-concurrent-loads',
                parseValue: (v) => parseInt(v, 10),
                onChange: (value) => this.updateSetting('maxConcurrentLoads', value)
            }
        ])
    }

    private attachButtonEvents(): void {
        UIComponentUtils.setupButtons(document.body, [
            {
                buttonId: 'reset-game-settings',
                onClick: this.resetToDefaults.bind(this)
            },
            {
                buttonId: 'export-game-settings',
                onClick: this.exportSettings.bind(this)
            },
            {
                buttonId: 'reset-cached-profile',
                onClick: this.clearCachedProfileAndReload.bind(this)
            }
        ])
    }

    /**
     * Clears the cached Steam user identity and reloads. Games and artwork caches are
     * untouched — only the vanity-url/steamid resolution is cleared, so the app has no
     * profile to fall back to and lands on the anonymous store on the next load.
     */
    // TODO: look into preventing the multi-tab issue
    private clearCachedProfileAndReload(): void {
        const confirmed = window.confirm(
            'Clear the cached Steam profile and reload?\n\n' +
            'Game and artwork caches are left intact.\n\n' +
            'If another tab or window has this app open, its cache may write back after reload — close them first for a clean reset.'
        )
        if (!confirmed) return

        EventManager.getInstance().emit<SteamUserClearEvent>(SteamEventTypes.UserClear, {
            source: EventSource.UI
        })
        window.location.reload()
    }

    private updateSetting<K extends keyof SteamSettings>(key: K, value: SteamSettings[K]): void {
        this.settings[key] = value
        this.saveSettings()
        
        // Notify callback of the change
        this.onSettingsChanged?.({ [key]: value } as Partial<SteamSettings>)
        

        
        console.log(`🎮 Game setting updated: ${key} = ${value}`)
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
        this.appSettings.setSetting(
            'developmentMode',
            this.appSettings.getDefaultSetting('developmentMode'),
            EventSource.UI
        )
        
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
        
        // Update feature flags from AppSettings
        const featureFlagCheckboxes = [
            { id: 'enable-labels', setting: 'enableLabels' as const },
            { id: 'enable-stickers', setting: 'enableStickers' as const },
            { id: 'enable-artwork', setting: 'enableArtwork' as const },
            { id: 'show-compass-rose', setting: 'showCompassRose' as const }
        ]
        
        featureFlagCheckboxes.forEach(({ id, setting }) => {
            const element = document.getElementById(id) as HTMLInputElement
            if (element) {
                element.checked = this.appSettings.getSetting(setting)
            }
        })
        
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
