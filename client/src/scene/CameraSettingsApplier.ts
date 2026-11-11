/**
 * Owns the main camera's projection settings: keeps the camera's fov/near/far equal to
 * AppSettings' cameraFov/cameraNear/cameraFar, and carries out the camera-preset settings actions
 * by writing those settings. Menus only ever set settings or raise the action; none touches the
 * camera.
 */

import type * as THREE from 'three'
import { AppSettings, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { AppSettingsEventTypes, UIEventTypes, type SettingsActionRequestedEvent } from '../types/InteractionEvents'
import { CAMERA_PRESET_ACTION_PREFIX } from '../ui/settings/SettingsActions'
import { CAMERA_PRESETS, type CameraPresetKey } from './CameraPresets'

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
        const { actionId } = event.detail
        if (!actionId.startsWith(CAMERA_PRESET_ACTION_PREFIX)) return

        const preset = CAMERA_PRESETS[actionId.slice(CAMERA_PRESET_ACTION_PREFIX.length) as CameraPresetKey]
        if (!preset) return

        const settings = AppSettings.getInstance()
        settings.setSetting('cameraFov', preset.fov)
        settings.setSetting('cameraNear', preset.near)
        settings.setSetting('cameraFar', preset.far)
    }
}
