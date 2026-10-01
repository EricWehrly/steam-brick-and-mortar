/**
 * The 'application' tab - auto-save, and the three things you do to the settings as a whole: reset
 * them, export them, import them. Same id as the DOM ApplicationPanel it replaces, so the two menus
 * stay in sync on which panel is showing.
 *
 * Reset asks first (a modal here, since window.confirm() is blocked inside an immersive session).
 * Export and import lean on browser UI - a download, a native file picker - that can't be reached
 * from a headset, so they're flatscreen-only; see the vr-settings-file-io entry in
 * docs/tech-debt.md.
 */

import { SETTINGS_ACTION } from '../SettingsActions'
import { action, toggle, type SettingsPanelSchema } from '../SettingsSchema'

export const APPLICATION_SCHEMA: SettingsPanelSchema = {
    id: 'application',
    title: 'Application',
    icon: '⚙️',
    sections: [
        {
            heading: 'General Settings',
            content: [
                toggle('autoSave', { label: 'Auto-save Settings' }),
                action(SETTINGS_ACTION.ResetAll, {
                    label: 'Reset to Defaults',
                    confirm: {
                        title: 'Reset all settings?',
                        message: 'Every setting returns to its default. This cannot be undone.',
                        confirmLabel: 'Reset'
                    }
                }),
                action(SETTINGS_ACTION.Export, { label: 'Export Settings', flatscreenOnly: true }),
                action(SETTINGS_ACTION.Import, { label: 'Import Settings', flatscreenOnly: true })
            ]
        }
    ]
}
