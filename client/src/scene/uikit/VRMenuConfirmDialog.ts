/**
 * A modal "are you sure?" over the whole VR menu. Exists because window.confirm() - what the DOM
 * menu uses - is blocked inside an immersive session, so a surface that has to work in a headset
 * needs a confirmation it draws itself.
 *
 * Owned by VRSettingsMenuShell and added to the menu ROOT, not to a panel: uikit's AlertDialog is
 * an absolutely-positioned overlay filling its parent, and a panel lives inside a scrolling content
 * area, where an overlay would scroll away with it. One instance serves every panel; a panel asks
 * through requestConfirmation() and never holds a reference to the dialog.
 *
 * The overlay, backdrop and "stop pointer events reaching what's underneath" behaviour are
 * uikit-default's own. Its buttons close the dialog themselves; we only add the confirm callback.
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
import { MENU_CLASS } from './VRMenuStyleSheet'

const CANCEL_LABEL = 'Cancel'

export interface ConfirmationRequest {
    readonly title: string
    readonly message: string
    readonly confirmLabel: string
    readonly onConfirm: () => void
}

export class VRMenuConfirmDialog {
    readonly container: AlertDialog

    private readonly titleText = new Text(undefined, [MENU_CLASS.dialogTitle])
    private readonly messageText = new Text(undefined, [MENU_CLASS.dialogMessage])
    private readonly confirmLabelText = new Text(undefined, [MENU_CLASS.dialogButtonLabel])
    private request: ConfirmationRequest | null = null

    constructor() {
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
    }

    get isOpen(): boolean {
        return this.container.currentSignal.value === true
    }

    show(request: ConfirmationRequest): void {
        this.request = request
        this.titleText.setProperties({ text: request.title })
        this.messageText.setProperties({ text: request.message })
        this.confirmLabelText.setProperties({ text: request.confirmLabel })
        this.container.setOpen(true)
    }

    /** What the Confirm button does. Public so tests can say "the user confirmed" without
     *  synthesizing a pointer-events click through uikit. */
    confirm(): void {
        const request = this.request
        this.request = null
        this.container.setOpen(false)
        request?.onConfirm()
    }

    cancel(): void {
        this.request = null
        this.container.setOpen(false)
    }
}
