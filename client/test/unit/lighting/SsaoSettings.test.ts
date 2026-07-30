import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AppSettings, Setting, SettingCategory, type SettingChangedEvent } from '../../../src/core/AppSettings'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { AppSettingsEventTypes } from '../../../src/types/InteractionEvents'

describe('SSAO settings', () => {
    beforeEach(() => {
        localStorage.clear()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
    })

    afterEach(() => {
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager
        localStorage.clear()
    })

    describe('Setting.SsaoQuality', () => {
        it('is defined with the correct key string', () => {
            expect(Setting.SsaoQuality).toBe('ssaoQuality')
        })

        it('is included in SettingCategory.Graphics', () => {
            expect(SettingCategory.Graphics).toContain(Setting.SsaoQuality)
        })
    })

    describe('default value', () => {
        it('defaults to level 1 (16 samples, half-res)', () => {
            const settings = AppSettings.getInstance()
            expect(settings.getSetting('ssaoQuality')).toBe(1)
        })

        it('is restored as 1 after a graphics category reset', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoQuality', 5, EventSource.UI)
            expect(settings.getSetting('ssaoQuality')).toBe(5)

            settings.resetSettingsToDefaults(SettingCategory.Graphics, EventSource.UI)
            expect(settings.getSetting('ssaoQuality')).toBe(1)
        })
    })

    describe('setSetting / event emission', () => {
        it('emits AppSettingsEventTypes.Changed when ssaoQuality changes', () => {
            const settings = AppSettings.getInstance()
            const eventManager = EventManager.getInstance()

            const received: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed,
                (event) => {
                    if (event.detail.settingName === 'ssaoQuality') {
                        received.push(event.detail)
                    }
                }
            )

            settings.setSetting('ssaoQuality', 0, EventSource.UI)

            expect(received).toHaveLength(1)
            expect(received[0].value).toBe(0)
            expect(received[0].previousValue).toBe(1)
            expect(received[0].source).toBe(EventSource.UI)
        })

        it('does not emit when the value is unchanged', () => {
            const settings = AppSettings.getInstance()
            const eventManager = EventManager.getInstance()

            const received: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed,
                (event) => {
                    if (event.detail.settingName === 'ssaoQuality') {
                        received.push(event.detail)
                    }
                }
            )

            settings.setSetting('ssaoQuality', 1, EventSource.UI)
            expect(received).toHaveLength(0)
        })

        it('can move across the full range of levels, including Off (0)', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoQuality', 0, EventSource.UI)
            expect(settings.getSetting('ssaoQuality')).toBe(0)
            settings.setSetting('ssaoQuality', 5, EventSource.UI)
            expect(settings.getSetting('ssaoQuality')).toBe(5)
        })
    })

    describe('persistence', () => {
        it('persists ssaoQuality=0 (Off) to localStorage and reloads correctly', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoQuality', 0, EventSource.UI)
            settings.saveSettings()

            AppSettings['instance'] = undefined as unknown as AppSettings
            EventManager['instance'] = undefined as unknown as EventManager

            const reloaded = AppSettings.getInstance()
            expect(reloaded.getSetting('ssaoQuality')).toBe(0)
        })
    })
})
