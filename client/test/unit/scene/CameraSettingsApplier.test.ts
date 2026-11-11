/**
 * CameraSettingsApplier keeps the camera equal to the camera settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'
import { CameraSettingsApplier } from '../../../src/scene/CameraSettingsApplier'

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

    it('stops following settings after dispose()', () => {
        applier.dispose()
        settings.setSetting('cameraFov', 100)

        expect(camera.fov).not.toBe(100)
    })
})
