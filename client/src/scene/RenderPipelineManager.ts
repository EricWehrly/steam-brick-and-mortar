import * as THREE from 'three'
import {
    EffectComposer,
    EffectPass,
    NormalPass,
    RenderPass,
    SSAOEffect,
    ToneMappingEffect,
    ToneMappingMode
} from 'postprocessing'
import { AppSettings } from '../core/AppSettings'

/**
 * Owns the rendering pipeline from base scene render through all post-processing passes.
 * SceneManager delegates its non-XR render call here.
 *
 * Pass order: RenderPass → NormalPass → EffectPass(SSAO) → EffectPass(ToneMapping)
 *
 * renderer.toneMapping is NoToneMapping so geometry renders into the HDR buffer without
 * pre-baked tone mapping. ToneMappingEffect(AGX) applies AgX as the final step.
 * renderer.toneMappingExposure still works — AgXToneMapping() in the effect shader reads
 * the Three.js toneMappingExposure uniform directly.
 *
 * SSAO and tone mapping are in separate EffectPasses so SSAO can be toggled independently.
 * NormalPass renders view-space normals into its own texture; SSAOEffect reads that texture.
 */
export class RenderPipelineManager {
    private readonly composer: EffectComposer
    private readonly ssaoPass: EffectPass

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
        this.composer = new EffectComposer(renderer, {
            frameBufferType: THREE.HalfFloatType
        })

        this.composer.addPass(new RenderPass(scene, camera))

        const normalPass = new NormalPass(scene, camera)
        this.composer.addPass(normalPass)

        const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
            samples: 16,
            rings: 7,
            radius: 0.1825,
            bias: 0.025,
            intensity: 1.0,
            luminanceInfluence: 0.7,
        })

        this.ssaoPass = new EffectPass(camera, ssaoEffect)
        this.ssaoPass.enabled = AppSettings.get('ssaoEnabled') as boolean
        this.composer.addPass(this.ssaoPass)

        this.composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.AGX })))
    }

    setSsaoEnabled(enabled: boolean): void {
        this.ssaoPass.enabled = enabled
    }

    render(): void {
        this.composer.render()
    }

    setSize(width: number, height: number): void {
        this.composer.setSize(width, height)
    }

    dispose(): void {
        this.composer.dispose()
    }
}
