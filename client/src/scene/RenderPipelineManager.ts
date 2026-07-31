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

export interface SsaoQualityLevel {
    readonly label: string
    readonly enabled: boolean
    readonly aoSamples: number
    readonly halfRes: boolean
}

/**
 * SSAO (N8AO) quality/cost levels, ascending GPU cost — index 0 is "Off". Values and ordering
 * come from measured GPU timer-query data (EXT_disjoint_timer_query_webgl2), not guessed:
 * halfRes turned out to be a bigger lever than sample count alone, so the ladder isn't a simple
 * "more samples = higher index" progression. denoiseSamples/denoiseRadius are left at n8ao's own
 * defaults throughout — only aoSamples/halfRes were varied in testing, so only those are varied
 * here. See docs/plans/framerate-regression-investigation-plan.md's dated Findings section for
 * the full before/after numbers.
 */
export const SSAO_QUALITY_LEVELS: readonly SsaoQualityLevel[] = [
    { label: 'Off', enabled: false, aoSamples: 16, halfRes: true },
    { label: '16 samples (half-res)', enabled: true, aoSamples: 16, halfRes: true },
    { label: '64 samples (half-res)', enabled: true, aoSamples: 64, halfRes: true },
    { label: '8 samples', enabled: true, aoSamples: 8, halfRes: false },
    { label: '16 samples', enabled: true, aoSamples: 16, halfRes: false },
    { label: '64 samples', enabled: true, aoSamples: 64, halfRes: false },
] as const

/** Default lands on the cheapest non-off tier (measured ~2.9ms GPU vs. ~13.8ms for the old
 *  64-samples/no-half-res default) — see the Findings section referenced above. */
export const DEFAULT_SSAO_QUALITY_INDEX = 1

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
    /** protected, not private: RenderPipelineManagerDebug (client/src/debug/) wraps these
     *  passes' render() methods directly for per-stage timing — see that class for why the
     *  instrumentation seam lives there instead of a callback field on this class. */
    protected readonly renderPass: RenderPass
    protected readonly n8aoPass: N8AOPostPass
    protected readonly toneMappingPass: EffectPass
    private readonly camera: THREE.PerspectiveCamera
    protected smaaPass: EffectPass

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.camera = camera
        this.composer = new EffectComposer(renderer, {
            frameBufferType: THREE.HalfFloatType
        })
        const msaaLevel = AppSettings.get('msaaLevel') as QualityLevel
        this.composer.multisampling = MSAA_SAMPLE_MAP[msaaLevel]

        this.renderPass = new RenderPass(scene, camera)
        this.composer.addPass(this.renderPass)

        this.n8aoPass = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight)
        this.n8aoPass.configuration.aoRadius = 1.5
        this.n8aoPass.configuration.intensity = 2.5
        this.n8aoPass.configuration.distanceFalloff = 1.0
        this.n8aoPass.configuration.gammaCorrection = false
        this.applySsaoQuality(AppSettings.get('ssaoQuality') as number)
        // N8AOPostPass extends Three.js Pass, not pmndrs Pass — interface is identical at runtime
        this.composer.addPass(this.n8aoPass as unknown as Pass)

        this.toneMappingPass = new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX }))
        this.composer.addPass(this.toneMappingPass)
        const smaaQuality = AppSettings.get('smaaPreset') as QualityLevel
        this.smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAA_PRESET_MAP[smaaQuality] }))
        this.composer.addPass(this.smaaPass)

        EventManager.getInstance().registerEventHandler<SettingChangedEvent>(
            AppSettingsEventTypes.Changed,
            this.onSettingChanged.bind(this)
        )
    }

    private applySsaoQuality(levelIndex: number): void {
        const level = SSAO_QUALITY_LEVELS[levelIndex] ?? SSAO_QUALITY_LEVELS[DEFAULT_SSAO_QUALITY_INDEX]
        this.n8aoPass.enabled = level.enabled
        this.n8aoPass.configuration.aoSamples = level.aoSamples
        this.n8aoPass.configuration.halfRes = level.halfRes
        this.n8aoPass.configuration.depthAwareUpsampling = level.halfRes
    }

    private onSettingChanged(event: CustomEvent<SettingChangedEvent>): void {
        const { settingName, value } = event.detail
        if (settingName === 'ssaoQuality') {
            this.applySsaoQuality(value as number)
        }
        if (settingName === 'smaaPreset') {
            this.rebuildSmaaPass(value as QualityLevel)
        }
        if (settingName === 'msaaLevel') {
            this.composer.multisampling = MSAA_SAMPLE_MAP[value as QualityLevel]
        }
    }

    /** protected, not private: RenderPipelineManagerDebug overrides this to re-wrap the new
     *  smaaPass instance after a rebuild, since the old wrapped reference is discarded here. */
    protected rebuildSmaaPass(quality: QualityLevel): void {
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
