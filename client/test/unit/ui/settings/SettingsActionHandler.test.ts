import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import {
    UIEventTypes,
    type ConfirmationAnsweredEvent,
    type ConfirmationRequestedEvent,
    type SettingsActionRequestedEvent
} from '../../../../src/types/InteractionEvents'
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

    describe('actions that ask first', () => {
        const PROMPT = { title: 'Reset all settings?', message: 'Cannot be undone.', confirmLabel: 'Reset' }
        let asked: ConfirmationRequestedEvent[]

        const requestWithPrompt = (actionId: SettingsActionId) =>
            eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId, confirm: PROMPT })
        const answer = (requestId: string, confirmed: boolean) =>
            eventManager.emit<ConfirmationAnsweredEvent>(UIEventTypes.ConfirmationAnswered, { requestId, confirmed })

        beforeEach(() => {
            asked = []
            eventManager.registerEventHandler<ConfirmationRequestedEvent>(UIEventTypes.ConfirmationRequested, e => { asked.push(e.detail) })
        })

        it('asks with the prompt instead of acting straight away', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')

            requestWithPrompt(SETTINGS_ACTION.ResetAll)

            expect(asked).toEqual([expect.objectContaining(PROMPT)])
            expect(reset).not.toHaveBeenCalled()
        })

        it('acts once the user says yes', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')
            requestWithPrompt(SETTINGS_ACTION.ResetAll)

            answer(asked[0].requestId, true)

            expect(reset).toHaveBeenCalledOnce()
        })

        it('does not act when the user says no', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')
            requestWithPrompt(SETTINGS_ACTION.ResetAll)

            answer(asked[0].requestId, false)

            expect(reset).not.toHaveBeenCalled()
        })

        it('acts at most once per request, however often it is answered', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')
            requestWithPrompt(SETTINGS_ACTION.ResetAll)

            answer(asked[0].requestId, true)
            answer(asked[0].requestId, true)

            expect(reset).toHaveBeenCalledOnce()
        })

        it('ignores an answer to a question it did not ask', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')

            answer('someone-elses-request', true)

            expect(reset).not.toHaveBeenCalled()
        })

        it('keeps simultaneous questions apart', () => {
            const reset = vi.spyOn(appSettings, 'resetToDefaults')
            requestWithPrompt(SETTINGS_ACTION.Export)
            requestWithPrompt(SETTINGS_ACTION.ResetAll)

            answer(asked[1].requestId, true)

            expect(reset).toHaveBeenCalledOnce()
            expect(fileTransfer.exportSettingsToFile).not.toHaveBeenCalled()
        })
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
