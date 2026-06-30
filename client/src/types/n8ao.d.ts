declare module 'n8ao' {
    import * as THREE from 'three'

    type N8AOQualityMode = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'

    export class N8AOPostPass {
        constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number)

        enabled: boolean
        needsDepthTexture: boolean
        needsSwap: boolean

        configuration: {
            aoSamples: number
            aoRadius: number
            aoTones: number
            denoiseSamples: number
            denoiseRadius: number
            distanceFalloff: number
            intensity: number
            denoiseIterations: number
            renderMode: 0 | 1 | 2 | 3 | 4
            gammaCorrection: boolean
            halfRes: boolean
            depthAwareUpsampling: boolean
            colorMultiply: boolean
            transparencyAware: boolean
            accumulate: boolean
        }

        setSize(width: number, height: number): void
        setDepthTexture(texture: THREE.Texture | null): void
        setQualityMode(mode: N8AOQualityMode): void
        render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget): void
        dispose(): void
    }
}
