/**
 * Moving settings in and out of a JSON file: a download for export, a native file picker for
 * import. Both lean on browser UI (an anchor click, an <input type="file">) that can't be reached
 * from inside an immersive session, so they're flatscreen-only features - see
 * ActionContent.flatscreenOnly. SettingsFileTransfer carries out the Export and Import settings
 * actions; the DOM ApplicationPanel calls the functions directly.
 */

import type { AppSettings } from '../../core/AppSettings'
import { EventSource, type EventManager } from '../../core/EventManager'
import { APP_STORAGE_PREFIX } from '../../core/StoragePrefix'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../types/InteractionEvents'
import { Logger } from '../../utils/Logger'
import { SETTINGS_ACTION } from './SettingsActions'

const logger = Logger.createLogFunctions('SettingsFileTransfer')

export class SettingsFileTransfer {
    constructor(
        private readonly eventManager: EventManager,
        private readonly appSettings: AppSettings
    ) {}

    init(): void {
        this.eventManager.registerEventHandler<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, this.transferOnRequest)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, this.transferOnRequest)
    }

    private readonly transferOnRequest = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
        if (event.detail.actionId === SETTINGS_ACTION.Export) exportSettingsToFile(this.appSettings)
        if (event.detail.actionId === SETTINGS_ACTION.Import) void importSettingsFromFile(this.appSettings)
    }
}

export function exportSettingsToFile(appSettings: AppSettings): void {
    const blob = new Blob([appSettings.exportSettings()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${APP_STORAGE_PREFIX}-settings-${Date.now()}.json`
    link.click()

    URL.revokeObjectURL(url)
}

/** Opens the native file picker and imports the chosen file. Anything showing the settings learns of
 *  the import from AppSettings' own change events. Resolves once the import has finished or been
 *  abandoned (picker dismissed, unreadable file, rejected settings); never rejects. */
export async function importSettingsFromFile(appSettings: AppSettings): Promise<void> {
    const file = await pickJsonFile()
    if (!file) return

    try {
        const imported = JSON.parse(await file.text())

        if (appSettings.importSettings(imported, EventSource.UI)) {
            logger.info('Settings imported successfully')
        } else {
            logger.warn('Invalid settings file format during import')
        }
    } catch (error) {
        logger.error('Failed to import settings. Please check the file format.', error)
    }
}

/** Resolves with the chosen file, or undefined if the picker was dismissed. */
function pickJsonFile(): Promise<File | undefined> {
    return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = () => resolve(input.files?.[0])
        input.oncancel = () => resolve(undefined)
        input.click()
    })
}
