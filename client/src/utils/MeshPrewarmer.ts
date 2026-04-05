/**
 * MeshPrewarmer
 *
 * Singleton that collects InstancedMesh objects from any renderer that opts in,
 * then calls renderer.compileAsync() once after a debounce window, ensuring all
 * registrations from a single init burst are batched into one compile call.
 *
 * Only active when KHR_parallel_shader_compile is available — without it,
 * compileAsync() blocks the main thread anyway and Three.js logs a warning,
 * so we skip it entirely and let shaders compile on first render.
 *
 * Usage (static API — no getInstance() needed):
 *   MeshPrewarmer.register(myInstancedMesh)
 *
 * The prewarm scene is a lightweight container (holds references only, no copies).
 * After compileAsync resolves the meshes are removed and the instance is released
 * for GC (one-shot lifecycle).
 */

import * as THREE from 'three'
import { DataManager } from '../core/data/DataManager'
import { DataKey } from '../core/data/DataTypes'
import { SystemCapabilitiesDetector } from './SystemCapabilities'
import { Logger } from './Logger'

const DEBOUNCE_MS = 500

export class MeshPrewarmer {
    // ES2022 private static field — truly private, not just TS-private.
    // Nulled in cleanup() to release for GC after the one-shot prewarm completes.
    static #instance: MeshPrewarmer | null = null
    private static readonly logger = Logger.createLogFunctions(MeshPrewarmer.name)

    // Single declaration of lazy-init logic. All static methods go through this getter.
    static get #current(): MeshPrewarmer {
        return MeshPrewarmer.#instance ??= new MeshPrewarmer()
    }

    private readonly prewarmScene = new THREE.Scene()
    private debounceHandle: ReturnType<typeof setTimeout> | null = null
    private completed = false

    private constructor() {}

    /**
     * Register a mesh for shader prewarm. Safe to call multiple times — each
     * call resets the debounce window so that a burst of registrations is
     * batched into a single compileAsync() call.
     *
     * No-op if prewarm has already completed or KHR is unavailable.
     */
    public static register(mesh: THREE.InstancedMesh): void {
        MeshPrewarmer.#current.registerImpl(mesh)
    }

    private registerImpl(mesh: THREE.InstancedMesh): void {
        if (this.completed) {
            MeshPrewarmer.logger.warn(
                `register("${mesh.name}") called after prewarm completed — mesh will compile on first render. ` +
                `If this is unexpected, ensure register() is called before the prewarm debounce fires.`
            )
            return
        }

        const capabilities = SystemCapabilitiesDetector.detect()
        if (!capabilities.hasParallelShaderCompile) return

        this.prewarmScene.add(mesh)
        MeshPrewarmer.logger.debug(`Registered mesh "${mesh.name}" for prewarm (${this.prewarmScene.children.length} total)`)

        // Reset debounce — wait for the burst to settle before compiling
        if (this.debounceHandle !== null) {
            clearTimeout(this.debounceHandle)
        }
        this.debounceHandle = setTimeout(() => this.runPrewarm(), DEBOUNCE_MS)
    }

    private async runPrewarm(): Promise<void> {
        this.debounceHandle = null

        const renderer = DataManager.getInstance().get<THREE.WebGLRenderer>(DataKey.Renderer)
        const camera   = DataManager.getInstance().get<THREE.Camera>(DataKey.MainCamera)

        if (!renderer || !camera) {
            MeshPrewarmer.logger.warn('Renderer/camera not available — skipping prewarm')
            this.cleanup()
            return
        }

        const meshCount = this.prewarmScene.children.length
        MeshPrewarmer.logger.debug(`🔥 Compiling ${meshCount} mesh(es) via compileAsync...`)
        const startTime = performance.now()

        try {
            await renderer.compileAsync(this.prewarmScene, camera)
            MeshPrewarmer.logger.debug(
                `✅ Shader prewarm complete — ${meshCount} mesh(es) in ${(performance.now() - startTime).toFixed(0)}ms`
            )
        } catch (error) {
            MeshPrewarmer.logger.warn('compileAsync failed (non-fatal):', error)
        }

        this.cleanup()
    }

    private cleanup(): void {
        for (const child of [...this.prewarmScene.children]) {
            this.prewarmScene.remove(child)
        }
        this.completed = true
        MeshPrewarmer.#instance = null  // release for GC — one-shot lifecycle
    }
}
