/**
 * The 'game-settings' tab - the DOM Game panel's controls that are bound to AppSettings: the
 * Steam-profile auto-load, the library cap, the GPU feature flags and the compass rose.
 *
 * The rest of that DOM panel (sort order, playtime filter, artwork downloads, history and cache
 * toggles) is stored in a separate local SteamSettings object, not AppSettings, so a schema has
 * nothing to bind it to yet. The DOM panel still owns those until the menu flip.
 */

import { toggle, type SettingsPanelSchema } from '../SettingsSchema'

export const GAME_SETTINGS_SCHEMA: SettingsPanelSchema = {
    id: 'game-settings',
    title: 'Game',
    icon: '🎮',
    sections: [
        {
            heading: '🔗 Steam Profile',
            content: [
                toggle('autoLoadProfile', {
                    label: 'Auto-load last used Steam profile',
                    description: 'Automatically load your most recently used Steam profile on startup.'
                })
            ]
        },
        {
            heading: '📚 Game Library',
            content: [
                toggle('developmentMode', {
                    label: 'Development mode (limit to 20 games)',
                    description: 'Limit library to 20 games for faster testing and development.'
                })
            ]
        },
        {
            heading: '⚡ Performance Features',
            description: 'Toggle GPU-intensive features to measure performance impact. Takes effect after a restart.',
            content: [
                toggle('enableLabels', {
                    label: 'Enable text labels',
                    description: 'Show text labels on game boxes (GPU intensive).'
                }),
                toggle('enableStickers', {
                    label: 'Enable shelf stickers',
                    description: 'Show decorative stickers on shelf sideboards (GPU intensive).'
                }),
                toggle('enableArtwork', {
                    label: 'Enable game artwork',
                    description: 'Show game artwork textures on boxes (core feature).'
                })
            ]
        },
        {
            heading: '🐛 Debug Tools',
            content: [
                toggle('showCompassRose', {
                    label: 'Show compass rose',
                    description: 'Display directional compass indicator for debugging spatial orientation.'
                })
            ]
        }
    ],
    resettable: false
}
