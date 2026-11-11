/**
 * Keeps the main camera's fov/near/far equal to AppSettings' cameraFov/cameraNear/cameraFar. Menus
 * only set settings; none touches the camera.
 */

import type * as THREE from 'three'
import { AppSettings, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { AppSettingsEventTypes } from '../types/InteractionEvents'

export class CameraSettingsApplier {
    private readonly eventManager = EventManager.getInstance()

    constructor(private readonly camera: THREE.PerspectiveCamera) {}

    init(): void {
        this.applySettings()
        this.eventManager.registerEventHandler<SettingChangedEvent>(AppSettingsEventTypes.Changed, this.applyOnSettingChanged)
    }

    dispose(): void {
        this.eventManager.deregisterEventHandler(AppSettingsEventTypes.Changed, this.applyOnSettingChanged)
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
}
