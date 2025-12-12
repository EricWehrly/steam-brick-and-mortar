/**
 * Tests for AppSettings reset functionality
 * 
 * Covers:
 * - resetSettingsToDefaults with category-based reset
 * - SettingCategory groupings
 * - Event emission on reset
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AppSettings, Setting, SettingCategory, type ApplicationSettings, type SettingChangedEvent } from '../../../src/core/AppSettings'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { AppSettingsEventTypes } from '../../../src/types/InteractionEvents'

describe('AppSettings Reset Functionality', () => {
    let appSettings: AppSettings
    let eventManager: EventManager
    
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear()
        
        // Reset singletons
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
        
        eventManager = EventManager.getInstance()
        appSettings = AppSettings.getInstance()
    })
    
    afterEach(() => {
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
        localStorage.clear()
    })
    
    describe('SettingCategory', () => {
        it('should define Graphics category with all graphics-related settings', () => {
            expect(SettingCategory.Graphics).toContain(Setting.LightingQuality)
            expect(SettingCategory.Graphics).toContain(Setting.ShadowQuality)
            expect(SettingCategory.Graphics).toContain(Setting.CeilingHeight)
            expect(SettingCategory.Graphics).toContain(Setting.EnableLighting)
            expect(SettingCategory.Graphics).toContain(Setting.ShowLightingDebug)
            expect(SettingCategory.Graphics).toContain(Setting.ShowCeiling)
            expect(SettingCategory.Graphics).toContain(Setting.LodHighDistance)
            expect(SettingCategory.Graphics).toContain(Setting.LodMedDistance)
            expect(SettingCategory.Graphics).toContain(Setting.LodMaxHighSlots)
            expect(SettingCategory.Graphics).toContain(Setting.LodHighReductionRatio)
            expect(SettingCategory.Graphics).toContain(Setting.LodMedReductionRatio)
        })
        
        it('should have Setting constants matching ApplicationSettings keys', () => {
            // Verify Setting constants are valid keys
            expect(Setting.LightingQuality).toBe('lightingQuality')
            expect(Setting.ShadowQuality).toBe('shadowQuality')
            expect(Setting.CeilingHeight).toBe('ceilingHeight')
        })
    })
    
    describe('resetSettingsToDefaults', () => {
        it('should reset only specified settings to defaults', () => {
            // Change some settings from defaults
            appSettings.setSetting('shadowQuality', 4, EventSource.UI) // Ultra
            appSettings.setSetting('ceilingHeight', 5.0, EventSource.UI)
            appSettings.setSetting('showFPS', true, EventSource.UI) // Not in Graphics category
            
            // Reset only shadowQuality and ceilingHeight
            const changes = appSettings.resetSettingsToDefaults(
                [Setting.ShadowQuality, Setting.CeilingHeight],
                EventSource.UI
            )
            
            // Should reset specified settings
            expect(appSettings.getSetting('shadowQuality')).toBe(appSettings.getDefaultSetting('shadowQuality'))
            expect(appSettings.getSetting('ceilingHeight')).toBe(appSettings.getDefaultSetting('ceilingHeight'))
            
            // Should NOT reset unspecified settings
            expect(appSettings.getSetting('showFPS')).toBe(true)
            
            // Should return only changed settings
            expect(changes).toHaveProperty('shadowQuality')
            expect(changes).toHaveProperty('ceilingHeight')
            expect(changes).not.toHaveProperty('showFPS')
        })
        
        it('should reset entire Graphics category when passed SettingCategory.Graphics', () => {
            // Change multiple graphics settings
            appSettings.setSetting('shadowQuality', 4, EventSource.UI)
            appSettings.setSetting('ceilingHeight', 5.0, EventSource.UI)
            appSettings.setSetting('lodHighDistance', 10.0, EventSource.UI)
            
            // Reset all graphics
            appSettings.resetSettingsToDefaults(SettingCategory.Graphics, EventSource.UI)
            
            // All graphics settings should be at defaults
            expect(appSettings.getSetting('shadowQuality')).toBe(appSettings.getDefaultSetting('shadowQuality'))
            expect(appSettings.getSetting('ceilingHeight')).toBe(appSettings.getDefaultSetting('ceilingHeight'))
            expect(appSettings.getSetting('lodHighDistance')).toBe(appSettings.getDefaultSetting('lodHighDistance'))
        })
        
        it('should emit SettingChanged events for each changed setting', () => {
            const changedEvents: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed, 
                (event: CustomEvent<SettingChangedEvent>) => {
                    changedEvents.push(event.detail)
                }
            )
            
            // Change a setting
            appSettings.setSetting('shadowQuality', 4, EventSource.UI)
            changedEvents.length = 0 // Clear the change event from setSetting
            
            // Reset it
            appSettings.resetSettingsToDefaults([Setting.ShadowQuality], EventSource.UI)
            
            // Should have emitted one event
            expect(changedEvents).toHaveLength(1)
            expect(changedEvents[0].key).toBe('shadowQuality')
            expect(changedEvents[0].previousValue).toBe(4)
            expect(changedEvents[0].value).toBe(appSettings.getDefaultSetting('shadowQuality'))
            expect(changedEvents[0].source).toBe(EventSource.UI)
        })
        
        it('should not emit events for settings already at default', () => {
            const changedEvents: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed, 
                (event: CustomEvent<SettingChangedEvent>) => {
                    changedEvents.push(event.detail)
                }
            )
            
            // Reset without changing anything first
            appSettings.resetSettingsToDefaults([Setting.ShadowQuality], EventSource.UI)
            
            // No events should be emitted
            expect(changedEvents).toHaveLength(0)
        })
        
        it('should return empty object when no settings changed', () => {
            const changes = appSettings.resetSettingsToDefaults(
                [Setting.ShadowQuality],
                EventSource.UI
            )
            
            expect(Object.keys(changes)).toHaveLength(0)
        })
        
        it('should save to localStorage when settings change', () => {
            const saveSpy = vi.spyOn(appSettings, 'saveSettings')
            
            // Change a setting
            appSettings.setSetting('shadowQuality', 4, EventSource.UI)
            saveSpy.mockClear()
            
            // Reset it
            appSettings.resetSettingsToDefaults([Setting.ShadowQuality], EventSource.UI)
            
            expect(saveSpy).toHaveBeenCalledTimes(1)
        })
        
        it('should not save to localStorage when no settings change', () => {
            const saveSpy = vi.spyOn(appSettings, 'saveSettings')
            
            // Reset already-default settings
            appSettings.resetSettingsToDefaults([Setting.ShadowQuality], EventSource.UI)
            
            expect(saveSpy).not.toHaveBeenCalled()
        })
    })
})
