import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../../../src/types/InteractionEvents'
import { SettingsActionHandler } from '../../../../src/ui/settings/SettingsActionHandler'
import { SETTINGS_ACTION, type SettingsActionId } from '../../../../src/ui/settings/SettingsActions'
import * as fileTransfer from '../../../../src/ui/settings/SettingsFileTransfer'

vi.mock('../../../../src/ui/settings/SettingsFileTransfer', () => ({
    exportSettingsToFile: vi.fn(),
    importSettingsFromFile: vi.fn()
}))

describe('SettingsActionHandler', () => {
    let eventManager: EventManager
    let appSettings: AppSettings
    let handler: SettingsActionHandler

    const request = (actionId: SettingsActionId) =>
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId })

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        appSettings = AppSettings.getInstance()
        vi.mocked(fileTransfer.exportSettingsToFile).mockClear()
        vi.mocked(fileTransfer.importSettingsFromFile).mockClear()
        handler = new SettingsActionHandler(eventManager, appSettings)
        handler.init()
    })

    afterEach(() => {
        handler.dispose()
        vi.restoreAllMocks()
    })

    it('resets every setting to its default when asked to reset all', () => {
        const reset = vi.spyOn(appSettings, 'resetToDefaults')

        request(SETTINGS_ACTION.ResetAll)

        expect(reset).toHaveBeenCalledOnce()
    })

    it('does not export or import when asked to reset', () => {
        vi.spyOn(appSettings, 'resetToDefaults')

        request(SETTINGS_ACTION.ResetAll)

        expect(fileTransfer.exportSettingsToFile).not.toHaveBeenCalled()
        expect(fileTransfer.importSettingsFromFile).not.toHaveBeenCalled()
    })

    it('exports the settings to a file when asked to export', () => {
        const reset = vi.spyOn(appSettings, 'resetToDefaults')

        request(SETTINGS_ACTION.Export)

        expect(fileTransfer.exportSettingsToFile).toHaveBeenCalledWith(appSettings)
        expect(reset).not.toHaveBeenCalled()
    })

    it('imports settings from a file when asked to import', () => {
        request(SETTINGS_ACTION.Import)

        expect(fileTransfer.importSettingsFromFile).toHaveBeenCalledWith(appSettings)
    })

    it('does nothing for an action id it does not know', () => {
        const reset = vi.spyOn(appSettings, 'resetToDefaults')

        expect(() => request('not-a-real-action' as SettingsActionId)).not.toThrow()

        expect(reset).not.toHaveBeenCalled()
        expect(fileTransfer.exportSettingsToFile).not.toHaveBeenCalled()
        expect(fileTransfer.importSettingsFromFile).not.toHaveBeenCalled()
    })

    it('stops responding once disposed', () => {
        const reset = vi.spyOn(appSettings, 'resetToDefaults')
        handler.dispose()

        request(SETTINGS_ACTION.ResetAll)
        request(SETTINGS_ACTION.Export)

        expect(reset).not.toHaveBeenCalled()
        expect(fileTransfer.exportSettingsToFile).not.toHaveBeenCalled()
    })
})
