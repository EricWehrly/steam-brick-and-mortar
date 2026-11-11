/**
 * The things a settings panel can ask the app to do that aren't "set this setting": reset every
 * setting, export them to a file, import them from one, clear or re-measure the caches. A panel's
 * action control names one of these ids and, when pressed, raises
 * UIEventTypes.SettingsActionRequested carrying it - the panel never calls the code that does the
 * work; whichever class owns an id subscribes and carries it out.
 */

export const SETTINGS_ACTION = {
    ResetAll: 'reset-all-settings',
    Export: 'export-settings',
    Import: 'import-settings',
    ClearCache: 'clear-cache',
    RefreshCacheStats: 'refresh-cache-stats'
} as const

export type SettingsActionId = typeof SETTINGS_ACTION[keyof typeof SETTINGS_ACTION]
