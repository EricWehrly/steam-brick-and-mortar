import { describe, it, expect, beforeEach } from 'vitest'
import { AlertDialogAction, AlertDialogCancel, type AlertDialogContent } from '@pmndrs/uikit-default'
import { EventManager } from '../../../../src/core/EventManager'
import {
    UIEventTypes,
    type ConfirmationRequestedEvent,
    type MenuCloseEvent,
    type SettingsActionRequestedEvent
} from '../../../../src/types/InteractionEvents'
import { SETTINGS_ACTION } from '../../../../src/ui/settings/SettingsActions'
import { VRMenuConfirmDialog } from '../../../../src/scene/uikit/VRMenuConfirmDialog'
import { resolvedProps } from '../../../utils/settings-panel-context'

describe('VRMenuConfirmDialog', () => {
    let eventManager: EventManager
    let raised: SettingsActionRequestedEvent['actionId'][]

    const ask = () =>
        eventManager.emit<ConfirmationRequestedEvent>(UIEventTypes.ConfirmationRequested, {
            actionId: SETTINGS_ACTION.ResetAll,
            title: 'Reset all settings?',
            message: 'This cannot be undone.',
            confirmLabel: 'Reset'
        })

    const isOpen = (dialog: VRMenuConfirmDialog) => dialog.currentSignal.value === true

    /** [cancel, confirm] in the footer. */
    const footerButtons = (dialog: VRMenuConfirmDialog) => {
        const content = dialog.children[0] as AlertDialogContent
        const [cancel, confirm] = content.children[1].children
        return { cancel, confirm }
    }

    /** What a real click does to a uikit button: its own onClick property, then 'click' listeners. */
    const click = (button: AlertDialogAction | AlertDialogCancel) => {
        const event = { type: 'click', stopPropagation: () => {} }
        ;(resolvedProps(button).onClick as ((e: typeof event) => void) | undefined)?.(event)
        button.dispatchEvent(event as never)
    }

    beforeEach(() => {
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
        raised = []
        eventManager.registerEventHandler<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, e => {
            raised.push(e.detail.actionId)
        })
    })

    it('is closed to begin with, with Cancel and Confirm buttons', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        const { cancel, confirm } = footerButtons(dialog)

        expect(isOpen(dialog)).toBe(false)
        expect(cancel).toBeInstanceOf(AlertDialogCancel)
        expect(confirm).toBeInstanceOf(AlertDialogAction)
    })

    it('opens when a confirmation is requested, without raising the action yet', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)

        ask()

        expect(isOpen(dialog)).toBe(true)
        expect(raised).toEqual([])
    })

    it('raises the guarded action and closes when confirmed', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()

        click(footerButtons(dialog).confirm as AlertDialogAction)

        expect(raised).toEqual([SETTINGS_ACTION.ResetAll])
        expect(isOpen(dialog)).toBe(false)
    })

    it('raises nothing and closes when cancelled', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()

        click(footerButtons(dialog).cancel as AlertDialogCancel)

        expect(raised).toEqual([])
        expect(isOpen(dialog)).toBe(false)
    })

    it('closes when the menu closes', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        ask()

        eventManager.emit<MenuCloseEvent>(UIEventTypes.MenuClose, { menuType: 'settings' })

        expect(isOpen(dialog)).toBe(false)
    })

    it('stops listening once disposed', () => {
        const dialog = new VRMenuConfirmDialog(eventManager)
        dialog.dispose()

        ask()

        expect(isOpen(dialog)).toBe(false)
    })
})
