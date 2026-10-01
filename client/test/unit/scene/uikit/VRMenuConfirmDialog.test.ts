import { describe, it, expect, vi } from 'vitest'
import { AlertDialog } from '@pmndrs/uikit-default'
import { VRMenuConfirmDialog, type ConfirmationRequest } from '../../../../src/scene/uikit/VRMenuConfirmDialog'

function request(onConfirm: () => void = () => {}): ConfirmationRequest {
    return { title: 'Reset all settings?', message: 'This cannot be undone.', confirmLabel: 'Reset', onConfirm }
}

describe('VRMenuConfirmDialog', () => {
    it('builds a real uikit AlertDialog, closed to begin with', () => {
        const dialog = new VRMenuConfirmDialog()

        expect(dialog.container).toBeInstanceOf(AlertDialog)
        expect(dialog.isOpen).toBe(false)
    })

    it('opens when asked to show a request', () => {
        const dialog = new VRMenuConfirmDialog()

        dialog.show(request())

        expect(dialog.isOpen).toBe(true)
    })

    it('runs the request\'s callback and closes when confirmed', () => {
        const dialog = new VRMenuConfirmDialog()
        const onConfirm = vi.fn()
        dialog.show(request(onConfirm))

        dialog.confirm()

        expect(onConfirm).toHaveBeenCalledOnce()
        expect(dialog.isOpen).toBe(false)
    })

    it('closes without running the callback when cancelled', () => {
        const dialog = new VRMenuConfirmDialog()
        const onConfirm = vi.fn()
        dialog.show(request(onConfirm))

        dialog.cancel()

        expect(onConfirm).not.toHaveBeenCalled()
        expect(dialog.isOpen).toBe(false)
    })

    it('runs a request\'s callback at most once, even if confirmed again', () => {
        const dialog = new VRMenuConfirmDialog()
        const onConfirm = vi.fn()
        dialog.show(request(onConfirm))

        dialog.confirm()
        dialog.confirm()

        expect(onConfirm).toHaveBeenCalledOnce()
    })

    it('does not run a request that was cancelled when a later confirm arrives', () => {
        const dialog = new VRMenuConfirmDialog()
        const onConfirm = vi.fn()
        dialog.show(request(onConfirm))
        dialog.cancel()

        dialog.confirm()

        expect(onConfirm).not.toHaveBeenCalled()
    })

    it('serves the latest request when shown again, never the earlier one', () => {
        const dialog = new VRMenuConfirmDialog()
        const first = vi.fn()
        const second = vi.fn()
        dialog.show(request(first))
        dialog.show(request(second))

        dialog.confirm()

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledOnce()
    })

    it('can be reopened after being closed', () => {
        const dialog = new VRMenuConfirmDialog()
        dialog.show(request())
        dialog.cancel()

        dialog.show(request())

        expect(dialog.isOpen).toBe(true)
    })

    it('cancel() on a dialog that is not open is harmless', () => {
        const dialog = new VRMenuConfirmDialog()

        expect(() => dialog.cancel()).not.toThrow()
        expect(dialog.isOpen).toBe(false)
    })
})
