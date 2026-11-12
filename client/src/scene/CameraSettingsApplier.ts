/**
 * Keeps the main camera's fov/near/far equal to AppSettings' cameraFov/cameraNear/cameraFar, and
 * turns an ApplyCameraPreset request into those settings. Menus only raise events and set settings;
 * none touches the camera.
 */

import type * as THREE from 'three'
import { AppSettings, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { AppSettingsEventTypes, UIEventTypes, type SettingsActionRequestedEvent } from '../types/InteractionEvents'
import { SETTINGS_ACTION } from '../ui/settings/SettingsActions'
import { CAMERA_PRESETS, type CameraPresetKey } from './CameraPresets'

/** The SettingsActionPayload field that names which CAMERA_PRESETS entry to apply. */
export const CAMERA_PRESET_PAYLOAD_KEY = 'preset'

function isCameraPresetKey(value: unknown): value is CameraPresetKey {
    return typeof value === 'string' && Object.hasOwn(CAMERA_PRESETS, value)
}

export class CameraSettingsApplier {
    private readonly eventManager = EventManager.getInstance()

    constructor(private readonly camera: THREE.PerspectiveCamera) {}

    init(): void {
        this.applySettings()
        this.eventManager.registerEventHandler<SettingChangedEvent>(AppSettingsEventTypes.Changed, this.applyOnSettingChanged)
        this.eventManager.registerEventHandler<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, this.applyPresetOnRequest)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(AppSettingsEventTypes.Changed, this.applyOnSettingChanged)
        this.eventManager.deregisterEventHandler(UIEventTypes.SettingsActionRequested, this.applyPresetOnRequest)
    }

    private applySettings(): void {
        this.camera.fov = AppSettings.get('cameraFov')
        this.camera.near = AppSettings.get('cameraNear')
        this.camera.far = AppSettings.get('cameraFar')
        this.camera.updateProjectionMatrix()
    }

    private readonly applyOnSettingChanged = (event: CustomEvent<SettingChangedEvent>): void => {
        const { settingName } = event.detail
        if (settingName === 'cameraFov' || settingName === 'cameraNear' || settingName === 'cameraFar') {
            this.applySettings()
        }
    }

    private readonly applyPresetOnRequest = (event: CustomEvent<SettingsActionRequestedEvent>): void => {
        if (event.detail.actionId !== SETTINGS_ACTION.ApplyCameraPreset) return
        const key = event.detail.payload?.[CAMERA_PRESET_PAYLOAD_KEY]
        if (!isCameraPresetKey(key)) return
        const { fov, near, far } = CAMERA_PRESETS[key]
        const appSettings = AppSettings.getInstance()
        appSettings.setSetting('cameraFov', fov)
        appSettings.setSetting('cameraNear', near)
        appSettings.setSetting('cameraFar', far)
    }
}
