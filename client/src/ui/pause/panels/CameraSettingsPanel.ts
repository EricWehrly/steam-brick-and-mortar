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
import type * as THREE from 'three'

export interface CameraPreset {
    name: string
    fov: number
    near: number
    far: number
    description: string
}

export const CAMERA_PRESETS: { [key: string]: CameraPreset } = {
    NORMAL: {
        name: 'Normal',
        fov: 75,
        near: 0.1,
        far: 1000,
        description: 'Standard perspective, natural look'
    },
    WIDE: {
        name: 'Wide',
        fov: 90,
        near: 0.1,
        far: 1000,
        description: 'Wider view, better for VR (default)'
    },
    ULTRA_WIDE: {
        name: 'Ultra Wide',
        fov: 110,
        near: 0.1,
        far: 1000,
        description: 'Maximum awareness, slight distortion'
    },
    CINEMATIC: {
        name: 'Cinematic',
        fov: 60,
        near: 0.1,
        far: 1000,
        description: 'Narrow FOV, focused view, less distortion'
    },
    TELEPHOTO: {
        name: 'Telephoto',
        fov: 45,
        near: 0.5,
        far: 1000,
        description: 'Very narrow, compressed perspective'
    }
}

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
        
        return renderTemplate(cameraSettingsPanelTemplate, {
            // Camera selection
            cameraCount: this.cameras.length,
            currentCameraIndex: this.currentCameraIndex + 1,
            hasPrevCamera: this.currentCameraIndex > 0,
            hasNextCamera: this.currentCameraIndex < this.cameras.length - 1,
            
            // Current camera values
            fov: camera?.fov?.toFixed(0) || 90,
            near: camera?.near?.toFixed(2) || 0.1,
            far: camera?.far?.toFixed(0) || 1000,
            
            // Preset selections
            presetNormal: currentPreset === 'NORMAL',
            presetWide: currentPreset === 'WIDE',
            presetUltraWide: currentPreset === 'ULTRA_WIDE',
            presetCinematic: currentPreset === 'CINEMATIC',
            presetTelephoto: currentPreset === 'TELEPHOTO',
            presetCustom: currentPreset === 'CUSTOM'
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
        const prevButton = this.container?.querySelector('#camera-prev-btn') as HTMLButtonElement
        const nextButton = this.container?.querySelector('#camera-next-btn') as HTMLButtonElement
        
        if (prevButton) {
            prevButton.addEventListener('click', () => {
                if (this.currentCameraIndex > 0) {
                    this.currentCameraIndex--
                    this.updateCameraDisplay()
                }
            })
        }
        
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (this.currentCameraIndex < this.cameras.length - 1) {
                    this.currentCameraIndex++
                    this.updateCameraDisplay()
                }
            })
        }
    }

    private attachPresetEvents(): void {
        const presetButtons = this.container?.querySelectorAll('[data-camera-preset]')
        
        presetButtons?.forEach(button => {
            button.addEventListener('click', (e) => {
                const presetKey = (e.target as HTMLElement).dataset.cameraPreset
                if (presetKey && CAMERA_PRESETS[presetKey]) {
                    this.applyPreset(CAMERA_PRESETS[presetKey])
                }
            })
        })
    }

    private attachSliderEvents(): void {
        // FOV slider
        const fovSlider = this.container?.querySelector('#camera-fov') as HTMLInputElement
        const fovValue = this.container?.querySelector('#camera-fov-value') as HTMLSpanElement
        
        if (fovSlider && fovValue) {
            fovSlider.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value
                fovValue.textContent = value + '°'
            })
            
            fovSlider.addEventListener('change', (e) => {
                const camera = this.getCurrentCamera()
                if (camera) {
                    camera.fov = parseFloat((e.target as HTMLInputElement).value)
                    camera.updateProjectionMatrix()
                }
            })
        }
        
        // Near clipping plane slider
        const nearSlider = this.container?.querySelector('#camera-near') as HTMLInputElement
        const nearValue = this.container?.querySelector('#camera-near-value') as HTMLSpanElement
        
        if (nearSlider && nearValue) {
            nearSlider.addEventListener('input', (e) => {
                const value = parseFloat((e.target as HTMLInputElement).value).toFixed(2)
                nearValue.textContent = value
            })
            
            nearSlider.addEventListener('change', (e) => {
                const camera = this.getCurrentCamera()
                if (camera) {
                    camera.near = parseFloat((e.target as HTMLInputElement).value)
                    camera.updateProjectionMatrix()
                }
            })
        }
        
        // Far clipping plane slider
        const farSlider = this.container?.querySelector('#camera-far') as HTMLInputElement
        const farValue = this.container?.querySelector('#camera-far-value') as HTMLSpanElement
        
        if (farSlider && farValue) {
            farSlider.addEventListener('input', (e) => {
                const value = (e.target as HTMLInputElement).value
                farValue.textContent = value
            })
            
            farSlider.addEventListener('change', (e) => {
                const camera = this.getCurrentCamera()
                if (camera) {
                    camera.far = parseFloat((e.target as HTMLInputElement).value)
                    camera.updateProjectionMatrix()
                }
            })
        }
    }

    private applyPreset(preset: CameraPreset): void {
        const camera = this.getCurrentCamera()
        if (!camera) return
        
        camera.fov = preset.fov
        camera.near = preset.near
        camera.far = preset.far
        camera.updateProjectionMatrix()
        
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
        
        // Update slider values
        const fovSlider = this.container?.querySelector('#camera-fov') as HTMLInputElement
        const fovValue = this.container?.querySelector('#camera-fov-value') as HTMLSpanElement
        if (fovSlider && fovValue) {
            fovSlider.value = camera.fov.toString()
            fovValue.textContent = camera.fov.toFixed(0) + '°'
        }
        
        const nearSlider = this.container?.querySelector('#camera-near') as HTMLInputElement
        const nearValue = this.container?.querySelector('#camera-near-value') as HTMLSpanElement
        if (nearSlider && nearValue) {
            nearSlider.value = camera.near.toString()
            nearValue.textContent = camera.near.toFixed(2)
        }
        
        const farSlider = this.container?.querySelector('#camera-far') as HTMLInputElement
        const farValue = this.container?.querySelector('#camera-far-value') as HTMLSpanElement
        if (farSlider && farValue) {
            farSlider.value = camera.far.toString()
            farValue.textContent = camera.far.toFixed(0)
        }
    }
}
