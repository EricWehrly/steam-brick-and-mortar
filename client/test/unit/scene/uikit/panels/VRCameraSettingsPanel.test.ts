/**
 * VRCameraSettingsPanel - data-wiring tests. Mutates the live THREE.PerspectiveCamera directly
 * (matching the DOM panel's own non-persisted behavior - see this panel's top comment), so tests
 * publish a real THREE.PerspectiveCamera under DataKey.MainCamera and assert against its fields
 * directly rather than mocking a data source.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { DataManager } from '../../../../../src/core/data/DataManager'
import { DataKey, DataDomain } from '../../../../../src/core/data/DataTypes'
import { VRCameraSettingsPanel } from '../../../../../src/scene/uikit/panels/VRCameraSettingsPanel'
import { CAMERA_PRESETS } from '../../../../../src/ui/pause/panels/CameraSettingsPanel'

function publishCamera(fov = 90, near = 0.1, far = 1000): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(fov, 1, near, far)
    DataManager.getInstance().set(DataKey.MainCamera, camera, { domain: DataDomain.Scene })
    return camera
}

describe('VRCameraSettingsPanel', () => {
    beforeEach(() => {
        DataManager.resetInstance()
    })

    it('constructs a real uikit component tree without throwing', () => {
        publishCamera()
        expect(() => new VRCameraSettingsPanel()).not.toThrow()
    })

    it('constructs fine with no camera published yet', () => {
        expect(() => new VRCameraSettingsPanel()).not.toThrow()
    })

    it('reads the published camera\'s current fov/near/far as initial slider values', () => {
        publishCamera(75, 0.5, 2000)
        const panel = new VRCameraSettingsPanel()

        // container: title, presets heading, presets row, fov row, near row, far row
        const fovValueText = panel.container.children[3].children[0].children[1]
        expect((fovValueText as unknown as { inputProperties: { text: string } }).inputProperties.text).toBe('75°')
    })

    it('applying a preset mutates the live camera and calls updateProjectionMatrix', () => {
        const camera = publishCamera()
        const updateSpy = vi.spyOn(camera, 'updateProjectionMatrix')
        const panel = new VRCameraSettingsPanel()

        const presetsRow = panel.container.children[2]
        const cinematicIndex = Object.keys(CAMERA_PRESETS).indexOf('CINEMATIC')
        const cinematicButton = presetsRow.children[cinematicIndex] as unknown as { inputProperties: { onClick: () => void } }
        cinematicButton.inputProperties.onClick()

        expect(camera.fov).toBe(CAMERA_PRESETS.CINEMATIC.fov)
        expect(camera.near).toBe(CAMERA_PRESETS.CINEMATIC.near)
        expect(camera.far).toBe(CAMERA_PRESETS.CINEMATIC.far)
        expect(updateSpy).toHaveBeenCalled()
    })
})
