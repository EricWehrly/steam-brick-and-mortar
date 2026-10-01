/**
 * Moving settings in and out of a JSON file: a download for export, a native file picker for
 * import. Both lean on browser UI (an anchor click, an <input type="file">) that can't be reached
 * from inside an immersive session, so they're flatscreen-only features - see
 * ActionContent.flatscreenOnly. Plain functions rather than a class because there's no state to
 * own; SettingsActionHandler and the DOM ApplicationPanel both call them.
 */

import type { AppSettings } from '../../core/AppSettings'
import { EventSource } from '../../core/EventManager'
import { Logger } from '../../utils/Logger'

const logger = Logger.createLogFunctions('SettingsFileTransfer')

export function exportSettingsToFile(appSettings: AppSettings): void {
    const blob = new Blob([appSettings.exportSettings()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `steam-brick-mortar-settings-${Date.now()}.json`
    link.click()

    URL.revokeObjectURL(url)
}

/** Opens the native file picker and imports the chosen file. `onImported` runs only after a file
 *  was read, parsed and accepted - so a caller showing the settings can refresh itself. */
export function importSettingsFromFile(appSettings: AppSettings, onImported?: () => void): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (loaded) => {
            try {
                const imported = JSON.parse(loaded.target?.result as string)

                if (appSettings.importSettings(imported, EventSource.UI)) {
                    onImported?.()
                    logger.info('Settings imported successfully')
                } else {
                    logger.warn('Invalid settings file format during import')
                }
            } catch (error) {
                logger.error('Failed to import settings. Please check the file format.', error)
            }
        }

        reader.readAsText(file)
    }

    input.click()
}
