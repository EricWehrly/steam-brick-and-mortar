/**
 * Development Mode Toggle Integration Test
 * 
 * Tests the development mode toggle functionality after moving from main UI to GameSettingsPanel
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { GameSettingsPanel } from '../../../../src/ui/pause/panels/GameSettingsPanel'
import { EventManager } from '../../../../src/core/EventManager'
import { SteamEventTypes } from '../../../../src/types/InteractionEvents'
import { AppSettings } from '../../../../src/core/AppSettings'

describe('GameSettingsPanel Development Mode', () => {
    let gameSettingsPanel: GameSettingsPanel
    let eventManager: EventManager
    let appSettings: AppSettings
    let emitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        // Clear DOM and localStorage
        document.body.innerHTML = ''
        localStorage.clear()
        
        // Dispose existing AppSettings instance to get fresh state
        AppSettings.dispose()
        
        // Create fresh instances
        eventManager = EventManager.getInstance()
        appSettings = AppSettings.getInstance()
        emitSpy = vi.spyOn(eventManager, 'emit')
        
        gameSettingsPanel = new GameSettingsPanel()
    })

    afterEach(() => {
        gameSettingsPanel.dispose()
        AppSettings.dispose()
        emitSpy.mockRestore()
    })

    describe('Development Mode Setting', () => {
        it('should include developmentMode in default AppSettings', () => {
            const developmentMode = appSettings.getSetting('developmentMode')
            expect(developmentMode).toBe(true) // Default should be enabled
        })

        it('should include developmentMode in template rendering', () => {
            const rendered = gameSettingsPanel.render()
            expect(rendered).toContain('id="dev-mode-toggle"')
            expect(rendered).toContain('Development mode (limit to 20 games)')
        })

        it('should handle development mode changes', () => {
            // Simulate the panel being rendered and attached
            document.body.innerHTML = gameSettingsPanel.render()
            gameSettingsPanel.attachEvents()

            const devModeToggle = document.getElementById('dev-mode-toggle') as HTMLInputElement
            expect(devModeToggle).toBeTruthy()

            // Test unchecking the development mode
            devModeToggle.checked = false
            devModeToggle.dispatchEvent(new Event('change'))

            // Verify AppSettings were updated
            const developmentMode = appSettings.getSetting('developmentMode')
            expect(developmentMode).toBe(false)
        })

        it('should emit DevModeToggle event when changed', () => {
            // Simulate the panel being rendered and attached
            document.body.innerHTML = gameSettingsPanel.render()
            gameSettingsPanel.attachEvents()

            const devModeToggle = document.getElementById('dev-mode-toggle') as HTMLInputElement
            expect(devModeToggle).toBeTruthy()

            // Test changing development mode
            devModeToggle.checked = false
            devModeToggle.dispatchEvent(new Event('change'))

            // Verify event was emitted
            expect(emitSpy).toHaveBeenCalledWith(
                SteamEventTypes.DevModeToggle,
                expect.objectContaining({
                    isEnabled: false,
                    timestamp: expect.any(Number),
                    source: 'ui'
                })
            )
        })

        it('should maintain development mode state in localStorage', () => {
            // Initial settings
            expect(appSettings.getSetting('developmentMode')).toBe(true)

            // Change development mode
            appSettings.setSetting('developmentMode', false)

            // Create new AppSettings instance and verify persistence
            AppSettings.dispose()
            const newAppSettings = AppSettings.getInstance()
            expect(newAppSettings.getSetting('developmentMode')).toBe(false)
        })

        it('should reset development mode to default when resetToDefaults is called', () => {
            // Simulate the panel being rendered and attached
            document.body.innerHTML = gameSettingsPanel.render()
            gameSettingsPanel.attachEvents()

            // Change development mode first
            appSettings.setSetting('developmentMode', false)
            expect(appSettings.getSetting('developmentMode')).toBe(false)

            // Reset to defaults
            const resetButton = document.getElementById('reset-game-settings') as HTMLButtonElement
            expect(resetButton).toBeTruthy()
            resetButton.click()

            // Verify development mode is back to default
            expect(appSettings.getSetting('developmentMode')).toBe(true)
        })
    })

    describe('Integration with Existing Settings', () => {
        it('should not affect other settings when changing development mode', () => {
            const initialSteamSettings = gameSettingsPanel.getSettings()
            const initialAppSettings = appSettings.getAllSettings()
            
            // Change development mode
            appSettings.setSetting('developmentMode', false)
            
            const updatedSteamSettings = gameSettingsPanel.getSettings()
            expect(appSettings.getSetting('developmentMode')).toBe(false)
            
            // Verify other settings remain unchanged
            expect(updatedSteamSettings.saveProfileHistory).toBe(initialSteamSettings.saveProfileHistory)
            expect(updatedSteamSettings.defaultSortOrder).toBe(initialSteamSettings.defaultSortOrder)
            expect(updatedSteamSettings.showUnplayedGames).toBe(initialSteamSettings.showUnplayedGames)
            expect(updatedSteamSettings.artworkQuality).toBe(initialSteamSettings.artworkQuality)
            expect(appSettings.getSetting('autoLoadProfile')).toBe(initialAppSettings.autoLoadProfile)
        })

        it('should work alongside other boolean settings', () => {
            // Simulate the panel being rendered and attached
            document.body.innerHTML = gameSettingsPanel.render()
            gameSettingsPanel.attachEvents()

            const devModeToggle = document.getElementById('dev-mode-toggle') as HTMLInputElement
            const showUnplayedToggle = document.getElementById('show-unplayed') as HTMLInputElement
            
            expect(devModeToggle).toBeTruthy()
            expect(showUnplayedToggle).toBeTruthy()

            // Change both settings
            devModeToggle.checked = false
            devModeToggle.dispatchEvent(new Event('change'))
            showUnplayedToggle.checked = false
            showUnplayedToggle.dispatchEvent(new Event('change'))

            const steamSettings = gameSettingsPanel.getSettings()
            expect(appSettings.getSetting('developmentMode')).toBe(false)
            expect(steamSettings.showUnplayedGames).toBe(false)
        })
    })
})