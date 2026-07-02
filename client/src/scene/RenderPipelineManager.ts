import * as THREE from 'three'
import {
    EffectComposer,
    EffectPass,
    Pass,
    RenderPass,
    SMAAEffect,
    SMAAPreset,
    ToneMappingEffect,
    ToneMappingMode
} from 'postprocessing'
import { N8AOPostPass } from 'n8ao'
import { AppSettings, QUALITY_LEVEL, type QualityLevel, type SettingChangedEvent } from '../core/AppSettings'
import { EventManager } from '../core/EventManager'
import { AppSettingsEventTypes } from '../types/InteractionEvents'

/**
 * Owns the rendering pipeline from base scene render through all post-processing passes.
 * SceneManager delegates its non-XR render call here.
 *
 * Pass order: RenderPass → N8AOPostPass → EffectPass(ToneMapping) → EffectPass(SMAA)
 *
 * renderer.toneMapping is NoToneMapping so geometry renders into the HDR buffer without
 * pre-baked tone mapping. ToneMappingEffect(AGX) applies AgX as the final step.
 * renderer.toneMappingExposure still works — AgXToneMapping() in the effect shader reads
 * the Three.js toneMappingExposure uniform directly.
 *
 * N8AOPostPass replaces NormalPass + SSAOEffect. It sets needsDepthTexture = true so the
 * EffectComposer automatically creates and distributes a stable depth texture.
 * gammaCorrection = false because ToneMappingEffect handles the HDR → display conversion.
 * SMAA runs after tone mapping so edge detection operates in LDR space.
 */

const SMAA_PRESET_MAP: Record<QualityLevel, SMAAPreset> = {
    [QUALITY_LEVEL.LOW]: SMAAPreset.LOW,
    [QUALITY_LEVEL.MEDIUM]: SMAAPreset.MEDIUM,
    [QUALITY_LEVEL.HIGH]: SMAAPreset.HIGH,
    [QUALITY_LEVEL.ULTRA]: SMAAPreset.ULTRA,
}

const N8AO_QUALITY_MAP: Record<QualityLevel, 'Low' | 'Medium' | 'High' | 'Ultra'> = {
    [QUALITY_LEVEL.LOW]: 'Low',
    [QUALITY_LEVEL.MEDIUM]: 'Medium',
    [QUALITY_LEVEL.HIGH]: 'High',
    [QUALITY_LEVEL.ULTRA]: 'Ultra',
}

export class RenderPipelineManager {
    private readonly composer: EffectComposer
    private readonly n8aoPass: N8AOPostPass
    private readonly camera: THREE.PerspectiveCamera
    private smaaPass: EffectPass

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.camera = camera
        this.composer = new EffectComposer(renderer, {
            frameBufferType: THREE.HalfFloatType
        })

        this.composer.addPass(new RenderPass(scene, camera))

        this.n8aoPass = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight)
        this.n8aoPass.configuration.aoRadius = 1.5
        this.n8aoPass.configuration.intensity = 2.5
        this.n8aoPass.configuration.distanceFalloff = 1.0
        this.n8aoPass.configuration.gammaCorrection = false
        const aoQuality = AppSettings.get('qualityLevel') as QualityLevel
        this.n8aoPass.setQualityMode(N8AO_QUALITY_MAP[aoQuality])
        this.n8aoPass.enabled = AppSettings.get('ssaoEnabled') as boolean
        // N8AOPostPass extends Three.js Pass, not pmndrs Pass — interface is identical at runtime
        this.composer.addPass(this.n8aoPass as unknown as Pass)

        this.composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })))
        const smaaQuality = AppSettings.get('smaaPreset') as QualityLevel
        this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAA_PRESET_MAP[smaaQuality] }))
        this.composer.addPass(this.smaaPass)

        EventManager.getInstance().registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.onSettingChanged.bind(this)
        )
    }

    private onSettingChanged(event: CustomEvent<SettingChangedEvent>): void {
        const { settingName, value } = event.detail
        if (settingName === 'ssaoEnabled') {
            this.n8aoPass.enabled = value as boolean
        }
        if (settingName === 'smaaPreset') {
            this.rebuildSmaaPass(value as QualityLevel)
        }
    }

    private rebuildSmaaPass(quality: QualityLevel): void {
        const idx = this.composer.passes.indexOf(this.smaaPass as unknown as Pass)
        if (idx !== -1) {
            this.smaaPass.dispose()
            this.composer.passes.splice(idx, 1)
        }
        this.smaaPass = new EffectPass(this.camera, new SMAAEffect({ preset: SMAA_PRESET_MAP[quality] }))
        this.composer.addPass(this.smaaPass)
    }

    render(): void {
        this.composer.render()
    }

    setSize(width: number, height: number): void {
        // EffectComposer.setSize() already resizes every registered pass — including
        // n8aoPass — using the drawing buffer size (CSS size × devicePixelRatio).
        // A second manual n8aoPass.setSize(width, height) here used raw CSS pixels,
        // undersizing N8AO's internal buffers whenever devicePixelRatio !== 1 and
        // producing a scale-mismatched, visibly offset AO ("ghost store") after any resize.
        this.composer.setSize(width, height)
    }

    dispose(): void {
        this.composer.dispose()
    }
}
