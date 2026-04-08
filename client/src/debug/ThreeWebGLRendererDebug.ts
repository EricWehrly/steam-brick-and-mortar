/**
 * ThreeWebGLRendererDebug — instrumented WebGLRenderer
 *
 * Drop-in replacement for THREE.WebGLRenderer during development / debug builds.
 * Swap the construction site; everything else stays the same since this is a subclass.
 *
 * Instruments:
 *   - gl.linkProgram hook (ctor): logs every GLSL program compile with material type,
 *     light counts, feature flags, and a readable stack trace (useful in Vite dev builds
 *     where Three.js is unminified)
 *   - render() override: warns when a frame exceeds the slow-frame threshold
 *
 * NOTE — renderer.compileAsync() and KHR_parallel_shader_compile:
 *   When using compileAsync() for pre-warming shaders, the non-blocking behaviour
 *   depends on the KHR_parallel_shader_compile WebGL extension. Without it
 *   (older GPUs / certain mobile drivers), compileAsync() still blocks synchronously
 *   while programs link - the call resolves, but only after all the work is done on the
 *   main thread. If a user reports that startup stalls persist on their hardware, check:
 *     gl.getExtension('KHR_parallel_shader_compile')
 *   and consider falling back to the staggered-scene.add() approach (spread adds across
 *   frames via FrameBudgetScheduler) when the extension is absent.
 */

import * as THREE from 'three'
import { Logger } from '../utils/Logger'

const SLOW_FRAME_THRESHOLD_MS = 100

export class ThreeWebGLRendererDebug extends THREE.WebGLRenderer {
    private static readonly logger = Logger.createLogFunctions(ThreeWebGLRendererDebug.name)
    constructor(parameters?: THREE.WebGLRendererParameters) {
        super(parameters)
        this.installShaderCompileLogger()
    }

    /**
     * Timed render -- warns when a frame exceeds the slow-frame threshold.
     * Also tracks light count changes which trigger shader recompile + shadow map rebuild.
     */
    private lastLightCount = -1

    override render(scene: THREE.Object3D, camera: THREE.Camera): void {
        // Detect light count change before render -- triggers shader recompile + shadow map
        let lightDelta = 0
        if (scene instanceof THREE.Scene) {
            let lightCount = 0
            scene.traverse((obj) => { if ((obj as any).isLight) lightCount++ })
            if (this.lastLightCount >= 0 && lightCount !== this.lastLightCount) {
                lightDelta = lightCount - this.lastLightCount
                ThreeWebGLRendererDebug.logger.warn(
                    '[ShadowMap] Light count changed by ' + (lightDelta > 0 ? '+' : '') + lightDelta +
                    ' (' + this.lastLightCount + '->' + lightCount + ') -- shadow map recompile imminent'
                )
            }
            this.lastLightCount = lightCount
        }

        const start = performance.now()
        super.render(scene, camera)
        const elapsed = performance.now() - start
        if (elapsed > SLOW_FRAME_THRESHOLD_MS) {
            const reason = lightDelta !== 0
                ? ' (light count changed by ' + (lightDelta > 0 ? '+' : '') + lightDelta + ')'
                : ''
            ThreeWebGLRendererDebug.logger.warn('Slow frame: render() took ' + elapsed.toFixed(1) + 'ms' + reason)
        }
    }

    /**
     * Patches gl.linkProgram to log every GLSL program compilation.
     * Each call = one unique (material type × light config × feature flags) triple.
     * Called once from the constructor — no overhead after startup when all
     * programs have been compiled and the driver cache is warm.
     */
    private installShaderCompileLogger(): void {
        const gl = this.getContext()
        const originalLinkProgram = gl.linkProgram.bind(gl)
        let programCount = 0

        gl.linkProgram = (program: WebGLProgram) => {
            programCount++

            // Both vert and frag carry the same #define block; read whichever has it
            const shaders = gl.getAttachedShaders(program) ?? []
            const allDefines: string[] = []
            for (const shader of shaders) {
                const src = gl.getShaderSource(shader) ?? ''

                // Material type — Three.js injects exactly one per program
                const matType = src.match(/#define (STANDARD|PHYSICAL|PHONG|TOON|NORMAL|DEPTH|ALPHATEST|POINTS|DASHED)\b/)?.[1]
                if (matType) allDefines.push(matType)

                // Light counts — only non-zero ones affect the hash
                for (const key of ['NUM_DIR_LIGHTS', 'NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS', 'NUM_RECT_AREA_LIGHTS', 'NUM_HEMI_LIGHTS']) {
                    const m = src.match(new RegExp(`#define ${key} (\\d+)`))
                    if (m && m[1] !== '0') allDefines.push(`${key}=${m[1]}`)
                }

                // Feature flags — each unique combo produces a distinct compiled program
                for (const flag of ['USE_MAP', 'USE_NORMALMAP', 'USE_ROUGHNESSMAP', 'USE_ENVMAP', 'USE_INSTANCING', 'USE_SKINNING']) {
                    if (src.includes(`#define ${flag}`)) allDefines.push(flag.replace('USE_', ''))
                }
            }

            const summary = [...new Set(allDefines)].join(' | ') || '(custom/unknown)'

            // Stack trace: 'acquireProgram' confirms the Three.js path that triggered this.
            // In Vite dev mode Three.js is unminified so function names are readable.
            const stack = new Error().stack ?? ''
            const relevantFrames = stack.split('\n')
                .slice(1, 8)
                .map(f => f.trim().replace(/^at /, ''))
                .join(' → ')

            ThreeWebGLRendererDebug.logger.debug(`🔧 [ShaderCompile] Program #${programCount}: ${summary}\n  ${relevantFrames}`)

            return originalLinkProgram(program)
        }
    }
}
