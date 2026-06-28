import * as THREE from 'three'

/**
 * Owns the rendering pipeline from base scene render through all post-processing passes.
 * SceneManager delegates its non-XR render call here.
 *
 * Current state: base render only — no post-processing passes.
 * Next: EffectComposer + SSAOPass land here, then Bloom, FXAA, LUT as separate commits.
 */
export class RenderPipelineManager {
    private readonly renderer: THREE.WebGLRenderer
    private readonly scene: THREE.Scene
    private readonly camera: THREE.Camera

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
        this.renderer = renderer
        this.scene = scene
        this.camera = camera
        console.log('[RenderPipelineManager] initialized')
    }

    render(): void {
        this.renderer.render(this.scene, this.camera)
    }

    dispose(): void {
        // Post-processing passes will be disposed here as they are added
    }
}
