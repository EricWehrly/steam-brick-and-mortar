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

    describe('Setting.SsaoEnabled', () => {
        it('is defined with the correct key string', () => {
            expect(Setting.SsaoEnabled).toBe('ssaoEnabled')
        })

        it('is included in SettingCategory.Graphics', () => {
            expect(SettingCategory.Graphics).toContain(Setting.SsaoEnabled)
        })
    })

    describe('default value', () => {
        it('defaults to true', () => {
            const settings = AppSettings.getInstance()
            expect(settings.getSetting('ssaoEnabled')).toBe(true)
        })

        it('is restored as true after a graphics category reset', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoEnabled', false, EventSource.UI)
            expect(settings.getSetting('ssaoEnabled')).toBe(false)

            settings.resetSettingsToDefaults(SettingCategory.Graphics, EventSource.UI)
            expect(settings.getSetting('ssaoEnabled')).toBe(true)
        })
    })

    describe('setSetting / event emission', () => {
        it('emits AppSettingsEventTypes.Changed when ssaoEnabled changes', () => {
            const settings = AppSettings.getInstance()
            const eventManager = EventManager.getInstance()

            const received: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed,
                (event) => {
                    if (event.detail.settingName === 'ssaoEnabled') {
                        received.push(event.detail)
                    }
                }
            )

            settings.setSetting('ssaoEnabled', false, EventSource.UI)

            expect(received).toHaveLength(1)
            expect(received[0].value).toBe(false)
            expect(received[0].previousValue).toBe(true)
            expect(received[0].source).toBe(EventSource.UI)
        })

        it('does not emit when the value is unchanged', () => {
            const settings = AppSettings.getInstance()
            const eventManager = EventManager.getInstance()

            const received: SettingChangedEvent[] = []
            eventManager.registerEventHandler<SettingChangedEvent>(
                AppSettingsEventTypes.Changed,
                (event) => {
                    if (event.detail.settingName === 'ssaoEnabled') {
                        received.push(event.detail)
                    }
                }
            )

            settings.setSetting('ssaoEnabled', true, EventSource.UI)
            expect(received).toHaveLength(0)
        })

        it('can be toggled on and off', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoEnabled', false, EventSource.UI)
            expect(settings.getSetting('ssaoEnabled')).toBe(false)
            settings.setSetting('ssaoEnabled', true, EventSource.UI)
            expect(settings.getSetting('ssaoEnabled')).toBe(true)
        })
    })

    describe('persistence', () => {
        it('persists ssaoEnabled=false to localStorage and reloads correctly', () => {
            const settings = AppSettings.getInstance()
            settings.setSetting('ssaoEnabled', false, EventSource.UI)
            settings.saveSettings()

            AppSettings['instance'] = undefined as unknown as AppSettings
            EventManager['instance'] = undefined as unknown as EventManager

            const reloaded = AppSettings.getInstance()
            expect(reloaded.getSetting('ssaoEnabled')).toBe(false)
        })
    })
})
