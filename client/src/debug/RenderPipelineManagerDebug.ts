/**
 * RenderPipelineManagerDebug — instrumented RenderPipelineManager
 *
 * Follows the same pattern as ThreeWebGLRendererDebug / SceneManagerDebug: extend the
 * production class, swap the construction site, everything else stays the same.
 *
 * Wraps each composer pass's render() and the shadow-map render with timing that feeds
 * RenderLoopDiagnostics.recordTiming() directly — no instrumentor callback field on the
 * production RenderPipelineManager, no reach-in from RenderLoopDiagnostics either. Gated on
 * UrlUtils.isDiagnosticsEnabled(), checked once in the constructor before anything is wrapped:
 * this class can be the one always constructed (matching the other ...Debug wrappers, which are
 * already unconditional at their construction sites) without paying any wrapping cost when
 * diagnostics aren't in use.
 */
import * as THREE from 'three'
import { RenderPipelineManager } from '../scene/RenderPipelineManager'
import type { QualityLevel } from '../core/AppSettings'
import { RenderLoopDiagnostics } from './RenderLoopDiagnostics'
import { GpuTimerQuery } from './GpuTimerQuery'
import { UrlUtils } from '../utils/UrlUtils'

/** Structural type for a render stage's timing wrapper — Pass instances and
 *  THREE.WebGLShadowMap both satisfy this without a shared base type. */
interface DiagnosticsRenderTarget {
    render: (...args: unknown[]) => unknown
}

const PIPELINE_STAGE_IDS = {
    RENDER_PASS: 'pipeline:renderPass',
    N8AO: 'pipeline:n8ao',
    TONE_MAPPING: 'pipeline:toneMapping',
    SMAA: 'pipeline:smaa',
} as const

/** Three.js runs the shadow-map pass inside renderer.render(), which pmndrs RenderPass
 *  calls internally — so this stage's time is a subset of pipeline:renderPass, not a
 *  sibling cost. Don't sum stage totals expecting them to equal the frame total. */
const SHADOW_MAP_STAGE_ID = 'pipeline:shadowMap'

/** Stage ids that also get a real GPU timer query (see GpuTimerQuery), recorded under
 *  `${id}:gpu` alongside the existing CPU submission-time entry. Narrow on purpose —
 *  extend only when a specific pass's real GPU cost is actually in question. */
const GPU_TIMED_STAGE_IDS = new Set<string>([PIPELINE_STAGE_IDS.N8AO])

export class RenderPipelineManagerDebug extends RenderPipelineManager {
    private readonly diagnosticsEnabled: boolean
    private readonly instrumentedTargets = new WeakSet<object>()
    private gpuTimerQuery: GpuTimerQuery | null = null

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        super(renderer, scene, camera)
        this.diagnosticsEnabled = UrlUtils.isDiagnosticsEnabled()
        if (!this.diagnosticsEnabled) {
            return
        }

        const gl = renderer.getContext()
        if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
            this.gpuTimerQuery = new GpuTimerQuery(gl)
            if (!this.gpuTimerQuery.isSupported) {
                console.warn('🔧 [RenderPipelineManagerDebug] EXT_disjoint_timer_query_webgl2 unavailable — GPU-side timing skipped, CPU submission time still recorded')
            }
        }

        this.instrumentStage(PIPELINE_STAGE_IDS.RENDER_PASS, this.renderPass as unknown as DiagnosticsRenderTarget)
        this.instrumentStage(PIPELINE_STAGE_IDS.N8AO, this.n8aoPass as unknown as DiagnosticsRenderTarget)
        this.instrumentStage(PIPELINE_STAGE_IDS.TONE_MAPPING, this.toneMappingPass as unknown as DiagnosticsRenderTarget)
        this.instrumentStage(PIPELINE_STAGE_IDS.SMAA, this.smaaPass as unknown as DiagnosticsRenderTarget)
        this.instrumentStage(SHADOW_MAP_STAGE_ID, renderer.shadowMap as unknown as DiagnosticsRenderTarget)
    }

    /**
     * Polls pending GPU timer queries once per frame before delegating to the real render.
     * render() is already called exactly once per frame by SceneManager, so this is the
     * natural place to drain results without a render-loop hook of its own.
     */
    override render(): void {
        this.gpuTimerQuery?.poll()
        super.render()
    }

    /** Re-wraps the new smaaPass instance after a settings-driven rebuild — the base class
     *  discards the old (already-wrapped) instance and creates a fresh one in its place. */
    protected override rebuildSmaaPass(quality: QualityLevel): void {
        super.rebuildSmaaPass(quality)
        if (this.diagnosticsEnabled) {
            this.instrumentStage(PIPELINE_STAGE_IDS.SMAA, this.smaaPass as unknown as DiagnosticsRenderTarget)
        }
    }

    override dispose(): void {
        this.gpuTimerQuery?.dispose()
        super.dispose()
    }

    private instrumentStage(id: string, target: DiagnosticsRenderTarget): void {
        if (this.instrumentedTargets.has(target)) {
            return
        }
        const originalRender = target.render.bind(target)
        const gpuTimed = GPU_TIMED_STAGE_IDS.has(id)
        target.render = (...args: unknown[]) => {
            const start = performance.now()
            let result: unknown
            if (gpuTimed && this.gpuTimerQuery?.isSupported) {
                this.gpuTimerQuery.measure(
                    () => { result = originalRender(...args) },
                    (gpuMs) => RenderLoopDiagnostics.recordTiming(`${id}:gpu`, gpuMs)
                )
            } else {
                result = originalRender(...args)
            }
            RenderLoopDiagnostics.recordTiming(id, performance.now() - start)
            return result
        }
        this.instrumentedTargets.add(target)
    }
}
