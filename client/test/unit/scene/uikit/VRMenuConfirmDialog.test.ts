import { describe, it, expect, beforeEach } from 'vitest'
import { AlertDialog } from '@pmndrs/uikit-default'
import { EventManager } from '../../../../src/core/EventManager'
import {
    UIEventTypes,
    type ConfirmationAnsweredEvent,
    type ConfirmationRequestedEvent
} from '../../../../src/types/InteractionEvents'
import { VRMenuConfirmDialog } from '../../../../src/scene/uikit/VRMenuConfirmDialog'

describe('VRMenuConfirmDialog', () => {
    let eventManager: EventManager
    let answers: Pick<ConfirmationAnsweredEvent, 'requestId' | 'confirmed'>[]

    const ask = (requestId = 'r1') =>
        eventManager.emit<ConfirmationRequestedEvent>(UIEventTypes.ConfirmationRequested, {
            requestId,
            title: 'Reset all settings?',
            message: 'This cannot be undone.',
            confirmLabel: 'Reset'
        })

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        answers = []
        // EventManager stamps its own fields onto every detail; only the answer itself is under test.
        eventManager.registerEventHandler<ConfirmationAnsweredEvent>(UIEventTypes.ConfirmationAnswered, e => {
            answers.push({ requestId: e.detail.requestId, confirmed: e.detail.confirmed })
        })
    })

    it('builds a real uikit AlertDialog, closed to begin with', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)

        expect(dialog.container).toBeInstanceOf(AlertDialog)
        expect(dialog.isOpen).toBe(false)
    })

    it('opens when a confirmation is requested', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)

        ask()

        expect(dialog.isOpen).toBe(true)
    })

    it('answers yes, under the request\'s id, and closes when confirmed', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask('r7')

        dialog.confirm()

        expect(answers).toEqual([{ requestId: 'r7', confirmed: true }])
        expect(dialog.isOpen).toBe(false)
    })

    it('answers no and closes when cancelled', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask('r7')

        dialog.cancel()

        expect(answers).toEqual([{ requestId: 'r7', confirmed: false }])
        expect(dialog.isOpen).toBe(false)
    })

    it('answers a request at most once, even if confirmed again', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()

        dialog.confirm()
        dialog.confirm()

        expect(answers).toHaveLength(1)
    })

    it('does not answer yes to a request that was cancelled when a later confirm arrives', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()
        dialog.cancel()

        dialog.confirm()

        expect(answers).toEqual([{ requestId: 'r1', confirmed: false }])
    })

    it('tells the earlier asker "no" when a newer request replaces it, then serves the newer one', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask('first')
        ask('second')

        expect(answers).toEqual([{ requestId: 'first', confirmed: false }])

        dialog.confirm()

        expect(answers).toEqual([
            { requestId: 'first', confirmed: false },
            { requestId: 'second', confirmed: true }
        ])
    })

    it('can be reopened after being closed', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()
        dialog.cancel()

        ask('again')

        expect(dialog.isOpen).toBe(true)
    })

    it('cancel() on a dialog that is not open is harmless and answers nothing', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)

        expect(() => dialog.cancel()).not.toThrow()
        expect(dialog.isOpen).toBe(false)
        expect(answers).toEqual([])
    })

    it('stops listening once disposed', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        dialog.dispose()

        ask()

        expect(dialog.isOpen).toBe(false)
    })
})
