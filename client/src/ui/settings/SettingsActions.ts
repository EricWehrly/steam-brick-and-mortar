/**
 * The things a settings panel can ask the app to do that aren't "set this setting": reset every
 * setting, export them to a file, import them from one. A panel's action control names one of these
 * ids and, when pressed, raises UIEventTypes.SettingsActionRequested carrying it - the panel never
 * calls the code that does the work, and SettingsActionHandler decides how each id is carried out.
 */

export const SETTINGS_ACTION = {
    ResetAll: 'reset-all-settings',
    Export: 'export-settings',
    Import: 'import-settings'
} as const

export type SettingsActionId = typeof SETTINGS_ACTION[keyof typeof SETTINGS_ACTION]
