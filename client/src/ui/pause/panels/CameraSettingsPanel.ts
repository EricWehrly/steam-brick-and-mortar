/**
 * CameraSettingsPanel - Camera and perspective settings
 * 
 * Dedicated panel for camera-related settings:
 * - Field of View (FOV) adjustment
 * - Near/Far clipping plane distances
 * - Camera preset selection (Normal, Wide, Cinematic, etc.)
 * - Multiple camera management and switching
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import { renderTemplate } from '../../../utils/TemplateEngine'
import cameraSettingsPanelTemplate from '../../../templates/pause-menu/camera-settings-panel.html?raw'
import '../../../styles/pause-menu/camera-settings-panel.css'
import { AppSettings } from '../../../core/AppSettings'
import { DataManager } from '../../../core/data'
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
import { RangeControl } from '../../components/UIComponent'
import type * as THREE from 'three'
import { CAMERA_PRESETS, type CameraPreset, type CameraPresetKey } from '../../../scene/CameraPresets'

export class CameraSettingsPanel extends PauseMenuPanel {
    readonly id = 'camera-settings'
    readonly title = 'Camera'
    readonly icon = '📷'

    private appSettings: AppSettings
    private dataManager: DataManager
    private currentCameraIndex: number = 0
    private cameras: THREE.PerspectiveCamera[] = []

    constructor(config: PauseMenuPanelConfig = {}, appSettings: AppSettings) {
        super(config)
        this.appSettings = appSettings
        this.dataManager = DataManager.getInstance()
        this.loadCameras()
    }

    private loadCameras(): void {
        // Load main scene camera
        const mainCamera = this.dataManager.get<THREE.PerspectiveCamera>('core.mainCamera')
        if (mainCamera) {
            this.cameras.push(mainCamera)
        }
    }

    private getCurrentCamera(): THREE.PerspectiveCamera | null {
        return this.cameras[this.currentCameraIndex] || null
    }

    render(): string {
        const camera = this.getCurrentCamera()
        const currentPreset = this.detectCurrentPreset(camera)

        const fov = camera?.fov ?? 90
        const near = camera?.near ?? 0.1
        const far = camera?.far ?? 1000

        return renderTemplate(cameraSettingsPanelTemplate, {
            // Camera selection
            cameraCount: this.cameras.length,
            currentCameraIndex: this.currentCameraIndex + 1,
            hasPrevCamera: this.currentCameraIndex > 0,
            hasNextCamera: this.currentCameraIndex < this.cameras.length - 1,

            // Preset selections
            presetNormal: currentPreset === 'NORMAL',
            presetWide: currentPreset === 'WIDE',
            presetUltraWide: currentPreset === 'ULTRA_WIDE',
            presetCinematic: currentPreset === 'CINEMATIC',
            presetTelephoto: currentPreset === 'TELEPHOTO',
            presetCustom: currentPreset === 'CUSTOM',

            cameraFovControl: new RangeControl({
                id: 'camera-fov',
                label: 'Field of View (FOV)',
                description: 'Wider = more peripheral vision',
                min: 30,
                max: 120,
                step: 1,
                value: fov,
                formatDisplay: (v) => `${v.toFixed(0)}°`
            }).render(),

            cameraNearControl: new RangeControl({
                id: 'camera-near',
                label: 'Near Clipping Plane',
                description: 'Minimum visible distance. ⚠️ Too small (<0.01) causes Z-fighting',
                min: 0.01,
                max: 5,
                step: 0.01,
                value: near,
                formatDisplay: (v) => v.toFixed(2)
            }).render(),

            cameraFarControl: new RangeControl({
                id: 'camera-far',
                label: 'Far Clipping Plane',
                description: 'Maximum visible distance. ⚠️ Too large (>5000) reduces depth precision',
                min: 100,
                max: 5000,
                step: 10,
                value: far,
                formatDisplay: (v) => v.toFixed(0)
            }).render()
        })
    }
    
    onShow(): void {
        // Reload cameras when panel is shown
        this.loadCameras()
    }
    
    onHide(): void {
        // Nothing to cleanup
    }

    private detectCurrentPreset(camera: THREE.PerspectiveCamera | null): string {
        if (!camera) return 'CUSTOM'
        
        for (const [key, preset] of Object.entries(CAMERA_PRESETS)) {
            if (Math.abs(camera.fov - preset.fov) < 1 &&
                Math.abs(camera.near - preset.near) < 0.01 &&
                Math.abs(camera.far - preset.far) < 1) {
                return key
            }
        }
        
        return 'CUSTOM'
    }

    attachEvents(): void {
        this.attachCameraNavigationEvents()
        this.attachPresetEvents()
        this.attachSliderEvents()
    }

    private attachCameraNavigationEvents(): void {
        UIComponentUtils.setupButtons(this.container, [
            {
                buttonId: 'camera-prev-btn',
                onClick: () => {
                    if (this.currentCameraIndex > 0) {
                        this.currentCameraIndex--
                        this.updateCameraDisplay()
                    }
                }
            },
            {
                buttonId: 'camera-next-btn',
                onClick: () => {
                    if (this.currentCameraIndex < this.cameras.length - 1) {
                        this.currentCameraIndex++
                        this.updateCameraDisplay()
                    }
                }
            }
        ])
    }

    private attachPresetEvents(): void {
        UIComponentUtils.setupDataButtons(
            this.container,
            '[data-camera-preset]',
            'cameraPreset',
            (presetKey: string) => {
                if (presetKey in CAMERA_PRESETS) {
                    this.applyPreset(CAMERA_PRESETS[presetKey as CameraPresetKey])
                }
            }
        )
    }

    private attachSliderEvents(): void {
        UIComponentUtils.setupSliders(this.container, [
            {
                sliderId: 'camera-fov',
                valueDisplayId: 'camera-fov-value',
                formatDisplay: (v) => v.toFixed(0) + '°',
                onChange: (value) => this.appSettings.setSetting('cameraFov', value)
            },
            {
                sliderId: 'camera-near',
                valueDisplayId: 'camera-near-value',
                formatDisplay: (v) => v.toFixed(2),
                onChange: (value) => this.appSettings.setSetting('cameraNear', value)
            },
            {
                sliderId: 'camera-far',
                valueDisplayId: 'camera-far-value',
                formatDisplay: (v) => v.toFixed(0),
                onChange: (value) => this.appSettings.setSetting('cameraFar', value)
            }
        ])
    }

    // CameraSettingsApplier copies these settings onto the camera.
    private applyPreset(preset: CameraPreset): void {
        this.appSettings.setSetting('cameraFov', preset.fov)
        this.appSettings.setSetting('cameraNear', preset.near)
        this.appSettings.setSetting('cameraFar', preset.far)

        this.updateCameraDisplay()
    }
    
    private updateCameraDisplay(): void {
        const camera = this.getCurrentCamera()
        if (!camera) return
        
        // Update camera index display
        const indexDisplay = this.container?.querySelector('#camera-index-display')
        if (indexDisplay) {
            indexDisplay.textContent = `${this.currentCameraIndex + 1}`
        }
        
        // Update all slider values
        UIComponentUtils.updateSliderValue(
            this.container,
            'camera-fov',
            'camera-fov-value',
            camera.fov,
            (v) => v.toFixed(0) + '°'
        )
        
        UIComponentUtils.updateSliderValue(
            this.container,
            'camera-near',
            'camera-near-value',
            camera.near,
            (v) => v.toFixed(2)
        )
        
        UIComponentUtils.updateSliderValue(
            this.container,
            'camera-far',
            'camera-far-value',
            camera.far,
            (v) => v.toFixed(0)
        )
    }
}
