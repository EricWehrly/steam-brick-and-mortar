import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { AppSettings } from '../core/AppSettings'

/**
 * Owns the rendering pipeline from base scene render through all post-processing passes.
 * SceneManager delegates its non-XR render call here.
 *
 * Pass order: RenderPass → SSAOPass → OutputPass
 * OutputPass applies the renderer's toneMapping and outputColorSpace to the final frame —
 * required when using EffectComposer with AgX or any non-linear tone mapping.
 */
export class RenderPipelineManager {
    private readonly composer: EffectComposer
    private readonly ssaoPass: SSAOPass

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        // HalfFloatType preserves HDR values through the pass chain before OutputPass tone-maps them.
        const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
            type: THREE.HalfFloatType,
        })
        this.composer = new EffectComposer(renderer, renderTarget)
        this.composer.addPass(new RenderPass(scene, camera))

        // three/examples/jsm SSAOPass produces blurry offset artifacts at this scene scale.
        // This implementation is intentionally replaced by pmndrs/postprocessing SSAOEffect.
        this.ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight)
        this.ssaoPass.enabled = AppSettings.get('ssaoEnabled')
        this.composer.addPass(this.ssaoPass)

        this.composer.addPass(new OutputPass())
    }

    setSsaoEnabled(enabled: boolean): void {
        this.ssaoPass.enabled = enabled
    }

    render(): void {
        this.composer.render()
    }

    setSize(width: number, height: number): void {
        this.composer.setSize(width, height)
        this.ssaoPass.setSize(width, height)
    }

    dispose(): void {
        this.ssaoPass.dispose()
        this.composer.dispose()
    }
}
