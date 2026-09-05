/**
 * VR port of CameraSettingsPanel (client/src/ui/pause/panels/CameraSettingsPanel.ts) - Story 5 of
 * docs/plans/vr-uikit-menu-migration-plan.md.
 *
 * Domain survey (direct request, before building anything):
 *   - KEPT: FOV/near/far sliders and the five camera presets (Normal/Wide/Ultra Wide/Cinematic/
 *     Telephoto), all genuinely functional in the DOM panel.
 *   - Not AppSettings-backed, unlike display-advanced: the DOM panel's sliders mutate the live
 *     THREE.PerspectiveCamera directly (`camera.fov = value; camera.updateProjectionMatrix()`) and
 *     never touch AppSettings - `this.appSettings` is stored in the DOM class but never actually
 *     read or written anywhere in it. So these values are session-only today (reset to whatever
 *     SceneManager constructs the camera with on next reload), not persisted like the display-
 *     advanced controls are. This VR port preserves that exact behavior rather than adding
 *     persistence as an unrequested scope change - if FOV/near/far should start persisting, that's
 *     a DOM-panel-first decision, not something to slip in via this port. Consequence: this panel
 *     can't use SettingsSchema.ts (its RangeSettingControl.setting is typed to an AppSettings key
 *     specifically) - built with UIKitRowHelpers.createSliderRow directly instead, which is already
 *     generic (plain value + onChange, no AppSettings dependency).
 *   - DROPPED - dead, not just hard to port: the multi-camera prev/next navigation and camera-count
 *     display. `loadCameras()` only ever pushes DataKey.MainCamera - there is no second camera
 *     anywhere in this codebase for it to switch to, despite the class doc comment's aspirational
 *     "Multiple camera management and switching."
 *   - Simplified: the DOM panel highlights whichever preset button matches the camera's current
 *     values (detectCurrentPreset()). Presets here are click-to-apply only, not shown as toggled/
 *     active - cheaper than threading live-detection through every slider change for a purely
 *     visual affordance.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button } from '@pmndrs/uikit-default'
import type * as THREE from 'three'
import { DataManager } from '../../../core/data/DataManager'
import { DataKey } from '../../../core/data/DataTypes'
import { COLOR_TOKENS } from '../../../ui/ColorTokens'
import { createSliderRow, type UIKitSliderRow } from '../UIKitRowHelpers'
import { CAMERA_PRESETS, type CameraPreset } from '../../../ui/pause/panels/CameraSettingsPanel'

const PANEL_PADDING = 20
const TITLE_FONT_SIZE = 18
const SECTION_GAP = 16
const ROW_GAP = 8
const HEADING_FONT_SIZE = 13
const FOV_MIN = 30
const FOV_MAX = 120
const FOV_STEP = 1
const NEAR_MIN = 0.01
const NEAR_MAX = 5
const NEAR_STEP = 0.01
const FAR_MIN = 100
const FAR_MAX = 5000
const FAR_STEP = 10

export class VRCameraSettingsPanel {
    readonly container: Container

    private resolvedCamera: THREE.PerspectiveCamera | null = null
    private readonly fovRow: UIKitSliderRow
    private readonly nearRow: UIKitSliderRow
    private readonly farRow: UIKitSliderRow

    constructor() {
        const camera = this.getCamera()
        const fov = camera?.fov ?? CAMERA_PRESETS.WIDE.fov
        const near = camera?.near ?? CAMERA_PRESETS.WIDE.near
        const far = camera?.far ?? CAMERA_PRESETS.WIDE.far

        const root = new Container({ flexDirection: 'column', gap: SECTION_GAP, padding: PANEL_PADDING, width: '100%' })
        root.add(new Text({ text: 'Camera', fontSize: TITLE_FONT_SIZE, color: COLOR_TOKENS.textPrimary }))

        root.add(this.buildSectionHeading('Presets'))
        root.add(this.buildPresetsRow())

        this.fovRow = createSliderRow({
            label: 'Field of View (FOV)',
            min: FOV_MIN, max: FOV_MAX, step: FOV_STEP, value: fov,
            formatDisplay: v => `${v.toFixed(0)}°`,
            onChange: v => this.applyToCamera(camera => { camera.fov = v; camera.updateProjectionMatrix() })
        })
        root.add(this.fovRow.container)

        this.nearRow = createSliderRow({
            label: 'Near Clipping Plane',
            min: NEAR_MIN, max: NEAR_MAX, step: NEAR_STEP, value: near,
            formatDisplay: v => v.toFixed(2),
            onChange: v => this.applyToCamera(camera => { camera.near = v; camera.updateProjectionMatrix() })
        })
        root.add(this.nearRow.container)

        this.farRow = createSliderRow({
            label: 'Far Clipping Plane',
            min: FAR_MIN, max: FAR_MAX, step: FAR_STEP, value: far,
            formatDisplay: v => v.toFixed(0),
            onChange: v => this.applyToCamera(camera => { camera.far = v; camera.updateProjectionMatrix() })
        })
        root.add(this.farRow.container)

        this.container = root
    }

    private buildSectionHeading(text: string): Text {
        return new Text({ text: text.toUpperCase(), fontSize: HEADING_FONT_SIZE, color: COLOR_TOKENS.accent })
    }

    private buildPresetsRow(): Container {
        const row = new Container({ flexDirection: 'row', flexWrap: 'wrap', gap: ROW_GAP, width: '100%' })
        for (const preset of Object.values(CAMERA_PRESETS)) {
            const button = new Button({ variant: 'secondary', onClick: () => this.applyPreset(preset) })
            button.add(new Text({ text: preset.name, color: COLOR_TOKENS.textPrimary }))
            row.add(button)
        }
        return row
    }

    private applyPreset(preset: CameraPreset): void {
        this.applyToCamera(camera => {
            camera.fov = preset.fov
            camera.near = preset.near
            camera.far = preset.far
            camera.updateProjectionMatrix()
        })
        this.fovRow.setValue(preset.fov)
        this.nearRow.setValue(preset.near)
        this.farRow.setValue(preset.far)
    }

    private applyToCamera(mutate: (camera: THREE.PerspectiveCamera) => void): void {
        const camera = this.getCamera()
        if (camera) {
            mutate(camera)
        }
    }

    private getCamera(): THREE.PerspectiveCamera | null {
        this.resolvedCamera ??= DataManager.getInstance().get<THREE.PerspectiveCamera>(DataKey.MainCamera) ?? null
        return this.resolvedCamera
    }
}
