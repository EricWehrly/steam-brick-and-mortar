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
 * SMAA runs after tone mapping so edge detection operates on tone-mapped (LDR-valued) pixels —
 * still stored in the same HalfFloat buffer, since EffectComposer keeps one buffer format for
 * its entire pass chain (set once at construction, see `frameBufferType` below). Nothing is
 * "lost" mid-pipeline from a format change; only the values transition from HDR to LDR range,
 * at the tone-mapping pass specifically.
 *
 * MSAA (`composer.multisampling`) and SMAA are independent, additive-cost AA techniques —
 * running both is possible but not how most engines use AA, and it's worth knowing why before
 * combining them:
 * - SMAA (image-space) catches every edge in the final frame, including shader/alpha-tested
 *   aliasing MSAA can't see. MSAA only smooths geometric silhouette edges — a strict subset of
 *   what SMAA already covers.
 * - `composer.multisampling` is set once on EffectComposer's shared inputBuffer/outputBuffer
 *   pair (see createBuffer() in `postprocessing`), and that same pair is ping-ponged through
 *   *every* pass — not just RenderPass, the only one that rasterizes real triangle edges. Every
 *   later full-screen pass (N8AO, tone mapping, SMAA) reads/writes multisampled buffers too, so
 *   each pass boundary pays a WebGL2 multisample-resolve blit to make the buffer sampleable by
 *   the next pass, even though a full-viewport quad has no internal edges for MSAA to improve.
 * - That resolve cost is doubled again by the HalfFloat buffer format (2x the bytes-per-sample
 *   of a typical 8-bit MSAA target), on top of running at every pass boundary instead of once.
 * Net effect: MSAA here is pricier than intuition from a traditional forward-renderer suggests,
 * for a benefit SMAA already mostly provides. Reasonable default: SMAA as the primary technique,
 * MSAA off unless there's GPU headroom to spare — and if combining, don't max both (see
 * docs/plans/framerate-regression-investigation-plan.md for the sweep meant to quantify this).
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

/** Hardware MSAA sample count on EffectComposer's shared render targets — see the class doc
 *  comment above for why this is pricier than SMAA here and how the two relate. 'low' maps to
 *  0 (off), matching the pre-existing default before this setting existed. */
const MSAA_SAMPLE_MAP: Record<QualityLevel, number> = {
    [QUALITY_LEVEL.LOW]: 0,
    [QUALITY_LEVEL.MEDIUM]: 2,
    [QUALITY_LEVEL.HIGH]: 4,
    [QUALITY_LEVEL.ULTRA]: 8,
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
        const msaaLevel = AppSettings.get('msaaLevel') as QualityLevel
        this.composer.multisampling = MSAA_SAMPLE_MAP[msaaLevel]

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
        if (settingName === 'msaaLevel') {
            this.composer.multisampling = MSAA_SAMPLE_MAP[value as QualityLevel]
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
