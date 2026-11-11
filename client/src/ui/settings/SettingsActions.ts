/**
 * The things a settings panel can ask the app to do that aren't "set this setting": reset every
 * setting, export them to a file, import them from one, clear or re-measure the caches, apply a
 * camera preset. A panel's action control names one of these ids and, when pressed, raises
 * UIEventTypes.SettingsActionRequested carrying it - the panel never calls the code that does the
 * work. AppSettings carries out reset; SettingsFileTransfer export and import; CacheActionHandler
 * the cache ids; CameraSettingsApplier the camera presets.
 */

import type { CameraPresetKey } from '../../scene/CameraPresets'

export const SETTINGS_ACTION = {
    ResetAll: 'reset-all-settings',
    Export: 'export-settings',
    Import: 'import-settings',
    ClearCache: 'clear-cache',
    RefreshCacheStats: 'refresh-cache-stats'
} as const

export const CAMERA_PRESET_ACTION_PREFIX = 'camera-preset:'

export type CameraPresetActionId = `${typeof CAMERA_PRESET_ACTION_PREFIX}${CameraPresetKey}`

export type SettingsActionId = typeof SETTINGS_ACTION[keyof typeof SETTINGS_ACTION] | CameraPresetActionId

export function cameraPresetActionId(key: CameraPresetKey): CameraPresetActionId {
    return `${CAMERA_PRESET_ACTION_PREFIX}${key}`
}
