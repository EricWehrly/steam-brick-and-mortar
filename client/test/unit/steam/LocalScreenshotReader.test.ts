import { describe, it, expect, beforeEach, vi } from 'vitest'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
    invokeMock: vi.fn(),
    isTauriMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
    isTauri: isTauriMock,
}))

import { LocalScreenshotReader } from '../../../src/steam/LocalScreenshotReader'

describe('LocalScreenshotReader', () => {
    beforeEach(() => {
        invokeMock.mockReset()
        isTauriMock.mockReset()
    })

    describe('listScreenshots', () => {
        it('returns an empty array on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            const screenshots = await LocalScreenshotReader.listScreenshots()
            expect(screenshots).toEqual([])
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('returns whatever the Rust command reports on the desktop build', async () => {
            isTauriMock.mockReturnValue(true)
            const sample = [{ appid: 620, filename: '620/screenshots/a.jpg', width: 2560, height: 1600, creation: 123, caption: null }]
            invokeMock.mockResolvedValue(sample)

            const screenshots = await LocalScreenshotReader.listScreenshots()

            expect(invokeMock).toHaveBeenCalledWith('read_local_screenshots')
            expect(screenshots).toEqual(sample)
        })
    })

    describe('readScreenshotBytes', () => {
        it('returns null on the web build without calling invoke', async () => {
            isTauriMock.mockReturnValue(false)
            const bytes = await LocalScreenshotReader.readScreenshotBytes('620/screenshots/a.jpg')
            expect(bytes).toBeNull()
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('wraps the returned number[] in a Uint8Array on the desktop build', async () => {
            isTauriMock.mockReturnValue(true)
            invokeMock.mockResolvedValue([0xff, 0xd8, 0xff])

            const bytes = await LocalScreenshotReader.readScreenshotBytes('620/screenshots/a.jpg')

            expect(invokeMock).toHaveBeenCalledWith('read_local_screenshot_bytes', { filename: '620/screenshots/a.jpg' })
            expect(bytes).toBeInstanceOf(Uint8Array)
            expect(Array.from(bytes!)).toEqual([0xff, 0xd8, 0xff])
        })
    })
})
