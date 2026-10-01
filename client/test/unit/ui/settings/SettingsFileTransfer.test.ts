/**
 * Export builds a download link; import opens a native file picker and reads what's chosen. Neither
 * had a test while they were private methods on the DOM ApplicationPanel. jsdom has no
 * URL.createObjectURL and can't open a picker, so those are stubbed and the picker's input element
 * is captured from its click() - the file chosen is injected the way a real change event delivers it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AppSettings } from '../../../../src/core/AppSettings'
import { exportSettingsToFile, importSettingsFromFile } from '../../../../src/ui/settings/SettingsFileTransfer'

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
    function choose(file: File | undefined): void {
        Object.defineProperty(picker, 'files', { value: file ? [file] : [] })
        picker!.onchange?.({ target: picker } as unknown as Event)
    }

    it('opens a picker that accepts only JSON', () => {
        importSettingsFromFile(fakeSettings())

        expect(picker).toBeDefined()
        expect(picker!.type).toBe('file')
        expect(picker!.accept).toBe('.json')
    })

    it('imports the chosen file and reports success', async () => {
        const settings = fakeSettings()
        const onImported = vi.fn()
        importSettingsFromFile(settings, onImported)

        choose(new File(['{"autoSave":false}'], 'settings.json'))

        await vi.waitFor(() => expect(onImported).toHaveBeenCalledOnce())
        expect(settings.importSettings).toHaveBeenCalledWith({ autoSave: false }, expect.anything())
    })

    it('does not report success when the settings are rejected', async () => {
        const settings = fakeSettings({ importSettings: vi.fn(() => false) })
        const onImported = vi.fn()
        importSettingsFromFile(settings, onImported)

        choose(new File(['{"autoSave":"nope"}'], 'settings.json'))

        await vi.waitFor(() => expect(settings.importSettings).toHaveBeenCalled())
        expect(onImported).not.toHaveBeenCalled()
    })

    it('survives a file that is not valid JSON, importing nothing', async () => {
        const settings = fakeSettings()
        const onImported = vi.fn()
        importSettingsFromFile(settings, onImported)

        expect(() => choose(new File(['this is not json'], 'settings.json'))).not.toThrow()

        // The read completes on a later tick; give it one, then confirm nothing was imported.
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(settings.importSettings).not.toHaveBeenCalled()
        expect(onImported).not.toHaveBeenCalled()
    })

    it('does nothing when the picker is dismissed without choosing a file', async () => {
        const settings = fakeSettings()
        importSettingsFromFile(settings, vi.fn())

        choose(undefined)

        await new Promise(resolve => setTimeout(resolve, 20))
        expect(settings.importSettings).not.toHaveBeenCalled()
    })

    it('works without a success callback', async () => {
        const settings = fakeSettings()
        importSettingsFromFile(settings)

        choose(new File(['{}'], 'settings.json'))

        await vi.waitFor(() => expect(settings.importSettings).toHaveBeenCalled())
    })
})
