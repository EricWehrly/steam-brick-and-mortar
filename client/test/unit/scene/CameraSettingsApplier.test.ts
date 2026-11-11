/**
 * CameraSettingsApplier keeps the camera equal to the camera settings and turns preset actions
 * into those settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'
import { EventManager } from '../../../src/core/EventManager'
import { CAMERA_PRESETS } from '../../../src/scene/CameraPresets'
import { CameraSettingsApplier } from '../../../src/scene/CameraSettingsApplier'
import { UIEventTypes, type SettingsActionRequestedEvent } from '../../../src/types/InteractionEvents'
import { cameraPresetActionId } from '../../../src/ui/settings/SettingsActions'

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

    it('turns a preset action into the preset\'s three settings', () => {
        EventManager.getInstance().emit<SettingsActionRequestedEvent>(
            UIEventTypes.SettingsActionRequested,
            { actionId: cameraPresetActionId('CINEMATIC') }
        )

        const { fov, near, far } = CAMERA_PRESETS.CINEMATIC
        expect([camera.fov, camera.near, camera.far]).toEqual([fov, near, far])
        expect(settings.getSetting('cameraFov')).toBe(fov)
    })

    it('ignores an action that is not a known preset', () => {
        const before = camera.fov
        EventManager.getInstance().emit<SettingsActionRequestedEvent>(
            UIEventTypes.SettingsActionRequested,
            { actionId: 'camera-preset:NOPE' as never }
        )

        expect(camera.fov).toBe(before)
    })

    it('stops following settings after dispose()', () => {
        applier.dispose()
        settings.setSetting('cameraFov', 100)

        expect(camera.fov).not.toBe(100)
    })
})
