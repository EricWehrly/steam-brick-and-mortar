/**
 * Carries out the actions a settings panel asks for (see SettingsActions.ts). Panels - DOM or uikit
 * - raise UIEventTypes.SettingsActionRequested and never learn what happens next; this is the one
 * place that knows reset means AppSettings.resetToDefaults() and export means a file download.
 * An action whose request carries a `confirm` prompt waits: this asks through ConfirmationRequested
 * and acts only on a ConfirmationAnswered that says yes.
 */

import type { AppSettings } from '../../core/AppSettings'
import { EventSource, type EventManager } from '../../core/EventManager'
import {
    UIEventTypes,
    type ConfirmationAnsweredEvent,
    type ConfirmationRequestedEvent,
    type SettingsActionRequestedEvent
} from '../../types/InteractionEvents'
import { SETTINGS_ACTION, type SettingsActionId } from './SettingsActions'
import { exportSettingsToFile, importSettingsFromFile } from './SettingsFileTransfer'

export class SettingsActionHandler {
    /** Actions waiting on an answer, by the requestId they asked under. */
    private readonly awaitingConfirmation = new Map<string, SettingsActionId>()
    private nextRequestNumber = 0

    constructor(
        private readonly eventManager: EventManager,
        private readonly appSettings: AppSettings
    ) {}

    init(): void {
        this.eventManager.registerEventHandler<SettingsActionRequestedEvent>(
            UIEventTypes.SettingsActionRequested,
            this.handleSettingsActionRequested
        )
        this.eventManager.registerEventHandler<ConfirmationAnsweredEvent>(
            UIEventTypes.ConfirmationAnswered,
            this.handleConfirmationAnswered
        )
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, this.handleSettingsActionRequested)
        this.eventManager.deregisterEventHandler(UIEventTypes.ConfirmationAnswered, this.handleConfirmationAnswered)
        this.awaitingConfirmation.clear()
    }

    private readonly handleSettingsActionRequested = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
        const { actionId, confirm } = event.detail
        if (!confirm) {
            this.carryOut(actionId)
            return
        }

        const requestId = `settings-action-${this.nextRequestNumber++}`
        this.awaitingConfirmation.set(requestId, actionId)
        this.eventManager.emit<ConfirmationRequestedEvent>(UIEventTypes.ConfirmationRequested, { requestId, ...confirm })
    }

    private readonly handleConfirmationAnswered = (event: CustomEvent<ConfirmationAnsweredEvent>): void => {
        const { requestId, confirmed } = event.detail
        const actionId = this.awaitingConfirmation.get(requestId)
        if (actionId === undefined) {
            return
        }
        this.awaitingConfirmation.delete(requestId)
        if (confirmed) {
            this.carryOut(actionId)
        }
    }

    private carryOut(actionId: SettingsActionId): void {
        switch (actionId) {
            case SETTINGS_ACTION.ResetAll:
                this.appSettings.resetToDefaults(EventSource.UI)
                break
            case SETTINGS_ACTION.Export:
                exportSettingsToFile(this.appSettings)
                break
            case SETTINGS_ACTION.Import:
                void importSettingsFromFile(this.appSettings)
                break
        }
    }
}
