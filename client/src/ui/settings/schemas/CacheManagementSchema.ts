/**
 * The 'cache-management' tab - the image cache's size and the browser storage in use, a refresh
 * and a confirmed clear. CacheActionHandler reports the readouts and carries out both actions.
 *
 * Left to the DOM panel: the cached-users list with per-user Load (a list that grows with data has
 * no schema form yet) and its auto-download / limit / preload fields, which write a localStorage
 * key nothing reads, and its validate / download-missing buttons, which are stubs.
 */

import { SETTINGS_ACTION } from '../SettingsActions'
import { action, readout, type SettingsPanelSchema } from '../SettingsSchema'

/** What CacheActionHandler reports against. */
export const CACHE_READOUT_ID = {
    ImageCacheCount: 'image-cache-count',
    StorageUsage: 'storage-usage'
} as const

export const CACHE_MANAGEMENT_SCHEMA: SettingsPanelSchema = {
    id: 'cache-management',
    title: 'Cache',
    icon: '💾',
    sections: [
        {
            heading: 'Image Cache',
            content: [
                readout(CACHE_READOUT_ID.ImageCacheCount, 'Images cached'),
                readout(CACHE_READOUT_ID.StorageUsage, 'Browser storage'),
                action(SETTINGS_ACTION.RefreshCacheStats, { label: 'Refresh' }),
                action(SETTINGS_ACTION.ClearCache, {
                    label: 'Clear Cache',
                    confirm: {
                        title: 'Clear all cached data?',
                        message: 'Images will have to be downloaded again.',
                        confirmLabel: 'Clear'
                    }
                })
            ]
        }
    ]
}
