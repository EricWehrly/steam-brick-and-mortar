/**
 * CameraSettingsApplier keeps the camera equal to the camera settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'
import { EventManager } from '../../../src/core/EventManager'
import { CAMERA_PRESETS } from '../../../src/scene/CameraPresets'
import { CAMERA_PRESET_PAYLOAD_KEY, CameraSettingsApplier } from '../../../src/scene/CameraSettingsApplier'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../../src/types/InteractionEvents'
import { SETTINGS_ACTION } from '../../../src/ui/settings/SettingsActions'

describe('CameraSettingsApplier', () => {
    const settings = AppSettings.getInstance()
    let camera: THREE.PerspectiveCamera
    let applier: CameraSettingsApplier

    beforeEach(() => {
        settings.resetSettingsToDefaults(['cameraFov', 'cameraNear', 'cameraFar'])
        camera = new THREE.PerspectiveCamera(10, 1, 9, 99)
        applier = new CameraSettingsApplier(camera)
        applier.init()
    })

    afterEach(() => {
        applier.dispose()
        settings.resetSettingsToDefaults(['cameraFov', 'cameraNear', 'cameraFar'])
    })

    it('copies the settings onto the camera at init', () => {
        expect(camera.fov).toBe(settings.getSetting('cameraFov'))
        expect(camera.near).toBe(settings.getSetting('cameraNear'))
        expect(camera.far).toBe(settings.getSetting('cameraFar'))
    })

    it('follows a changed setting', () => {
        settings.setSetting('cameraFov', 95)

        expect(camera.fov).toBe(95)
    })

    function requestPreset(payload: Record<string, string> | undefined): void {
        EventManager.getInstance().emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, {
            actionId: SETTINGS_ACTION.ApplyCameraPreset,
            payload
        })
    }

    it('applies the named preset to the settings and camera', () => {
        requestPreset({ [CAMERA_PRESET_PAYLOAD_KEY]: 'TELEPHOTO' })

        expect(settings.getSetting('cameraFov')).toBe(CAMERA_PRESETS.TELEPHOTO.fov)
        expect(settings.getSetting('cameraNear')).toBe(CAMERA_PRESETS.TELEPHOTO.near)
        expect(camera.fov).toBe(CAMERA_PRESETS.TELEPHOTO.fov)
    })

    it.each([
        ['no payload', undefined],
        ['an unknown preset', { [CAMERA_PRESET_PAYLOAD_KEY]: 'NOPE' }],
        ['an inherited key', { [CAMERA_PRESET_PAYLOAD_KEY]: 'toString' }]
    ])('ignores a preset request with %s', (_name, payload) => {
        requestPreset(payload)

        expect(settings.getSetting('cameraFov')).toBe(settings.getDefaultSetting('cameraFov'))
    })

    it('ignores other actions', () => {
        EventManager.getInstance().emit<SettingsActionRequestedEvent>(UIEventTypes.SettingsActionRequested, {
            actionId: SETTINGS_ACTION.ClearCache,
            payload: { [CAMERA_PRESET_PAYLOAD_KEY]: 'TELEPHOTO' }
        })

        expect(settings.getSetting('cameraFov')).toBe(settings.getDefaultSetting('cameraFov'))
    })

    it('stops following settings after dispose()', () => {
        applier.dispose()
        settings.setSetting('cameraFov', 100)

        expect(camera.fov).not.toBe(100)
    })
})
