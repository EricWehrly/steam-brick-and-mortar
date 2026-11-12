/**
 * uikit-default's AlertDialog, filled from UIEventTypes.ConfirmationRequested: it shows the prompt
 * and, only if the user confirms, raises the SettingsActionRequested the prompt guards. Cancel, the
 * backdrop and the Confirm button all close it themselves (uikit-default's own behaviour), so a "no"
 * needs no code at all. window.confirm() can't be used because it is blocked inside an immersive
 * session.
 *
 * Mounted on the menu ROOT by VRSettingsMenuShell, not inside a panel: the overlay fills its parent,
 * and inside the scrolling content area it would scroll away with the panel.
 */

import { Text } from '@pmndrs/uikit'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@pmndrs/uikit-default'
import type { EventManager } from '../../core/EventManager'
import {
    UIEventTypes,
    type ConfirmationRequestedEvent,
    type SettingsActionRequestedEvent
} from '../../types/InteractionEvents'
import { MENU_CLASS } from './VRMenuStyleSheet'

const CANCEL_LABEL = 'Cancel'

export class VRMenuConfirmDialog extends AlertDialog {
    private readonly titleText = new Text(undefined, [MENU_CLASS.dialogTitle])
    private readonly messageText = new Text(undefined, [MENU_CLASS.dialogMessage])
    private readonly confirmLabelText = new Text(undefined, [MENU_CLASS.dialogButtonLabel])
    private pendingAction: SettingsActionRequestedEvent | null = null

    constructor(private readonly eventManager: EventManager) {
        super()

        const title = new AlertDialogTitle()
        title.add(this.titleText)
        const message = new AlertDialogDescription()
        message.add(this.messageText)
        const header = new AlertDialogHeader()
        header.add(title, message)

        const cancel = new AlertDialogCancel()
        cancel.add(new Text({ text: CANCEL_LABEL }, [MENU_CLASS.dialogButtonLabel]))
        const confirm = new AlertDialogAction()
        confirm.add(this.confirmLabelText)
        confirm.addEventListener('click', this.raisePendingAction)

        const footer = new AlertDialogFooter(undefined, [MENU_CLASS.dialogFooter])
        footer.add(cancel, confirm)

        const content = new AlertDialogContent(undefined, [MENU_CLASS.dialog])
        content.add(header, footer)
        this.add(content)

        this.eventManager.registerEventHandler<ConfirmationRequestedEvent>(UIEventTypes.ConfirmationRequested, this.ask)
        this.eventManager.registerEventHandler(UIEventTypes.MenuClose, this.dismiss)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.ConfirmationRequested, this.ask)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.dismiss)
    }

    private readonly ask = (event: CustomEvent<ConfirmationRequestedEvent>): void => {
        const { actionId, payload, title, message, confirmLabel } = event.detail
        this.pendingAction = { actionId, payload }
        this.titleText.setProperties({ text: title })
        this.messageText.setProperties({ text: message })
        this.confirmLabelText.setProperties({ text: confirmLabel })
        this.setOpen(true)
    }

    /** So a reopened menu doesn't greet the user with a question from last time. */
    private readonly dismiss = (): void => {
        this.setOpen(false)
    }

    private readonly raisePendingAction = (): void => {
        if (this.pendingAction === null) return
        this.eventManager.emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, this.pendingAction)
    }
}
