/**
 * A modal "are you sure?" over the whole VR menu. Exists because window.confirm() is blocked inside
 * an immersive session and can't be drawn by a headset anyway, so a surface that has to work there
 * needs a confirmation it draws itself.
 *
 * Event-driven both ways: it opens on UIEventTypes.ConfirmationRequested and answers with
 * ConfirmationAnswered, so whoever needs a yes/no never holds a reference to it. Owned by
 * VRSettingsMenuShell and added to the menu ROOT, not to a panel: uikit's AlertDialog is an
 * absolutely-positioned overlay filling its parent, and a panel lives inside a scrolling content
 * area, where an overlay would scroll away with it.
 *
 * The overlay, backdrop and "stop pointer events reaching what's underneath" behaviour are
 * uikit-default's own. Its buttons close the dialog themselves; we only add the answer.
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
    type ConfirmationAnsweredEvent,
    type ConfirmationRequestedEvent
} from '../../types/InteractionEvents'
import { MENU_CLASS } from './VRMenuStyleSheet'

const CANCEL_LABEL = 'Cancel'

export class VRMenuConfirmDialog {
    readonly container: AlertDialog

    private readonly titleText = new Text(undefined, [MENU_CLASS.dialogTitle])
    private readonly messageText = new Text(undefined, [MENU_CLASS.dialogMessage])
    private readonly confirmLabelText = new Text(undefined, [MENU_CLASS.dialogButtonLabel])
    private openRequestId: string | null = null

    constructor(private readonly eventManager: EventManager) {
        this.container = new AlertDialog()

        const content = new AlertDialogContent(undefined, [MENU_CLASS.dialog])

        const header = new AlertDialogHeader()
        const title = new AlertDialogTitle()
        title.add(this.titleText)
        const message = new AlertDialogDescription()
        message.add(this.messageText)
        header.add(title, message)

        const cancel = new AlertDialogCancel()
        cancel.add(new Text({ text: CANCEL_LABEL }, [MENU_CLASS.dialogButtonLabel]))
        cancel.addEventListener('click', () => this.cancel())

        const confirm = new AlertDialogAction()
        confirm.add(this.confirmLabelText)
        confirm.addEventListener('click', () => this.confirm())

        const footer = new AlertDialogFooter(undefined, [MENU_CLASS.dialogFooter])
        footer.add(cancel, confirm)

        content.add(header, footer)
        this.container.add(content)

        this.eventManager.registerEventHandler<ConfirmationRequestedEvent>(
            UIEventTypes.ConfirmationRequested,
            this.handleConfirmationRequested
        )
        this.eventManager.registerEventHandler(UIEventTypes.MenuPanelChanged, this.handleQuestionAbandoned)
        this.eventManager.registerEventHandler(UIEventTypes.MenuClose, this.handleQuestionAbandoned)
    }

    get isOpen(): boolean {
        return this.container.currentSignal.value === true
    }

    /** What the Confirm button does. Public so tests can say "the user confirmed" without
     *  synthesizing a pointer-events click through uikit. */
    confirm(): void {
        this.close(true)
    }

    /** What the Cancel button does. Public for the same reason as confirm(). */
    cancel(): void {
        this.close(false)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.ConfirmationRequested, this.handleConfirmationRequested)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuPanelChanged, this.handleQuestionAbandoned)
        this.eventManager.deregisterEventHandler(UIEventTypes.MenuClose, this.handleQuestionAbandoned)
    }

    /** A question belongs to the panel that asked it and the menu session it was asked in; once
     *  either goes away the asker is told "no" rather than left waiting. */
    private readonly handleQuestionAbandoned = (): void => {
        this.cancel()
    }

    private readonly handleConfirmationRequested = (event: CustomEvent<ConfirmationRequestedEvent>): void => {
        // One dialog serves one question at a time; the one it replaces is answered "no" so its
        // asker isn't left waiting.
        this.cancel()

        const { requestId, title, message, confirmLabel } = event.detail
        this.openRequestId = requestId
        this.titleText.setProperties({ text: title })
        this.messageText.setProperties({ text: message })
        this.confirmLabelText.setProperties({ text: confirmLabel })
        this.container.setOpen(true)
    }

    private close(confirmed: boolean): void {
        const requestId = this.openRequestId
        this.openRequestId = null
        this.container.setOpen(false)
        if (requestId !== null) {
            this.eventManager.emit<ConfirmationAnsweredEvent>(UIEventTypes.ConfirmationAnswered, { requestId, confirmed })
        }
    }
}
