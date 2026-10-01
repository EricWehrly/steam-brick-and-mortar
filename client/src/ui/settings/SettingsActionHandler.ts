/**
 * Carries out the actions a settings panel asks for (see SettingsActions.ts). Panels - DOM or uikit
 * - raise UIEventTypes.SettingsActionRequested and never learn what happens next; this is the one
 * place that knows reset means AppSettings.resetToDefaults() and export means a file download.
 * Confirmation is the raising surface's job (window.confirm on the DOM menu, a modal in the uikit
 * one): by the time the event arrives, the user has already said yes.
 */

import type { AppSettings } from '../../core/AppSettings'
import { EventSource, type EventManager } from '../../core/EventManager'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../types/InteractionEvents'
import { SETTINGS_ACTION } from './SettingsActions'
import { exportSettingsToFile, importSettingsFromFile } from './SettingsFileTransfer'

export class SettingsActionHandler {
    constructor(
        private readonly eventManager: EventManager,
        private readonly appSettings: AppSettings
    ) {}

    init(): void {
        this.eventManager.registerEventHandler<SettingsActionRequestedEvent>(
            UIEventTypes.SettingsActionRequested,
            this.handleSettingsActionRequested
        )
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, this.handleSettingsActionRequested)
    }

    private readonly handleSettingsActionRequested = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
        switch (event.detail.actionId) {
            case SETTINGS_ACTION.ResetAll:
                this.appSettings.resetToDefaults(EventSource.UI)
                break
            case SETTINGS_ACTION.Export:
                exportSettingsToFile(this.appSettings)
                break
            case SETTINGS_ACTION.Import:
                importSettingsFromFile(this.appSettings)
                break
        }
    }
}
