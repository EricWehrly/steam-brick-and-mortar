/**
 * Export builds a download link; import opens a native file picker and reads what's chosen. Neither
 * had a test while they were private methods on the DOM ApplicationPanel. jsdom has no
 * URL.createObjectURL and can't open a picker, so those are stubbed and the picker's input element
 * is captured from its click() - the file chosen is injected the way a real change event delivers it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AppSettings } from '../../../../src/core/AppSettings'
import { EventManager } from '../../../../src/core/EventManager'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../../../src/types/InteractionEvents'
import { SETTINGS_ACTION, type SettingsActionId } from '../../../../src/ui/settings/SettingsActions'
import { exportSettingsToFile, importSettingsFromFile, SettingsFileTransfer } from '../../../../src/ui/settings/SettingsFileTransfer'

function fakeSettings(overrides: Partial<Record<'exportSettings' | 'importSettings', unknown>> = {}) {
    return {
        exportSettings: vi.fn(() => '{"autoSave":true}'),
        importSettings: vi.fn(() => true),
        ...overrides
    } as unknown as AppSettings & { exportSettings: ReturnType<typeof vi.fn>; importSettings: ReturnType<typeof vi.fn> }
}

describe('exportSettingsToFile', () => {
    let clicked: HTMLAnchorElement[]

    beforeEach(() => {
        clicked = []
        URL.createObjectURL = vi.fn(() => 'blob:settings')
        URL.revokeObjectURL = vi.fn()
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            clicked.push(this)
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('downloads the settings as a dated JSON file', () => {
        exportSettingsToFile(fakeSettings())

        expect(clicked).toHaveLength(1)
        expect(clicked[0].download).toMatch(/^steam-brick-mortar-settings-\d+\.json$/)
        expect(clicked[0].href).toBe('blob:settings')
    })

    it('puts the exported settings JSON in the file', async () => {
        exportSettingsToFile(fakeSettings({ exportSettings: () => '{"autoSave":false}' }))

        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
        expect(blob.type).toBe('application/json')
        expect(await blob.text()).toBe('{"autoSave":false}')
    })

    it('releases the object URL after the download starts', () => {
        exportSettingsToFile(fakeSettings())

        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:settings')
    })
})


describe('importSettingsFromFile', () => {
    let picker: HTMLInputElement | undefined

    beforeEach(() => {
        picker = undefined
        vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
            picker = this
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    /** Delivers a chosen file to the picker the way the browser's change event does. */
    function choose(file: File): void {
        Object.defineProperty(picker, 'files', { value: [file] })
        picker!.onchange?.(new Event('change'))
    }

    function dismiss(): void {
        picker!.oncancel?.(new Event('cancel'))
    }

    it('opens a picker that accepts only JSON', () => {
        void importSettingsFromFile(fakeSettings())

        expect(picker).toBeDefined()
        expect(picker!.type).toBe('file')
        expect(picker!.accept).toBe('.json')
    })

    it('imports the chosen file', async () => {
        const settings = fakeSettings()
        const done = importSettingsFromFile(settings)

        choose(new File(['{"autoSave":false}'], 'settings.json'))
        await done

        expect(settings.importSettings).toHaveBeenCalledWith({ autoSave: false }, expect.anything())
    })

    it('resolves without throwing when the settings are rejected', async () => {
        const settings = fakeSettings({ importSettings: vi.fn(() => false) })
        const done = importSettingsFromFile(settings)

        choose(new File(['{"autoSave":"nope"}'], 'settings.json'))

        await expect(done).resolves.toBeUndefined()
        expect(settings.importSettings).toHaveBeenCalled()
    })

    it('survives a file that is not valid JSON, importing nothing', async () => {
        const settings = fakeSettings()
        const done = importSettingsFromFile(settings)

        choose(new File(['this is not json'], 'settings.json'))

        await expect(done).resolves.toBeUndefined()
        expect(settings.importSettings).not.toHaveBeenCalled()
    })

    it('imports nothing when the picker is dismissed without choosing a file', async () => {
        const settings = fakeSettings()
        const done = importSettingsFromFile(settings)

        dismiss()

        await expect(done).resolves.toBeUndefined()
        expect(settings.importSettings).not.toHaveBeenCalled()
    })
})

describe('SettingsFileTransfer', () => {
    const eventManager = EventManager.getInstance()
    let settings: ReturnType<typeof fakeSettings>
    let transfer: SettingsFileTransfer
    let picked: number

    const request = (actionId: SettingsActionId) =>
        eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, { actionId })

    beforeEach(() => {
        settings = fakeSettings()
        picked = 0
        URL.createObjectURL = vi.fn(() => 'blob:settings')
        URL.revokeObjectURL = vi.fn()
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => { picked++ })
        transfer = new SettingsFileTransfer(eventManager, settings)
        transfer.init()
    })

    afterEach(() => {
        transfer.dispose()
        vi.restoreAllMocks()
    })

    it('exports when the export action is requested', () => {
        request(SETTINGS_ACTION.Export)

        expect(settings.exportSettings).toHaveBeenCalledOnce()
        expect(picked).toBe(0)
    })

    it('opens the import picker when the import action is requested', () => {
        request(SETTINGS_ACTION.Import)

        expect(picked).toBe(1)
        expect(settings.exportSettings).not.toHaveBeenCalled()
    })

    it('ignores the actions it does not own', () => {
        request(SETTINGS_ACTION.ResetAll)

        expect(settings.exportSettings).not.toHaveBeenCalled()
        expect(picked).toBe(0)
    })

    it('stops listening once disposed', () => {
        transfer.dispose()

        request(SETTINGS_ACTION.Export)

        expect(settings.exportSettings).not.toHaveBeenCalled()
    })
})
