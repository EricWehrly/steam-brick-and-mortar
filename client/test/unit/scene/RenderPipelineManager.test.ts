import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'

// Module-level captures populated when constructors are called from RenderPipelineManager
let capturedComposer: { addPass: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } | null = null
let capturedSsaoPass: { enabled: boolean; setSize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } | null = null

// Regular function declarations — arrow functions cannot be used as constructors
vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
    EffectComposer: function MockEffectComposer() {
        capturedComposer = { addPass: vi.fn(), render: vi.fn(), setSize: vi.fn(), dispose: vi.fn() }
        return capturedComposer
    },
}))

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
    RenderPass: function MockRenderPass() { return {} },
}))

vi.mock('three/examples/jsm/postprocessing/SSAOPass.js', () => ({
    SSAOPass: function MockSSAOPass() {
        capturedSsaoPass = { enabled: true, setSize: vi.fn(), dispose: vi.fn() }
        return capturedSsaoPass
    },
}))

vi.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({
    OutputPass: function MockOutputPass() { return {} },
}))

import { RenderPipelineManager } from '../../../src/scene/RenderPipelineManager'

describe('RenderPipelineManager', () => {
    let pipeline: RenderPipelineManager
    let renderer: THREE.WebGLRenderer
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera

    beforeEach(() => {
        capturedComposer = null
        capturedSsaoPass = null
        localStorage.clear()
        AppSettings['instance'] = undefined as unknown as AppSettings

        renderer = {} as unknown as THREE.WebGLRenderer
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera()
        pipeline = new RenderPipelineManager(renderer, scene, camera)
    })

    it('adds three passes to the composer (RenderPass, SSAOPass, OutputPass)', () => {
        expect(capturedComposer!.addPass).toHaveBeenCalledTimes(3)
    })

    it('initializes SSAOPass.enabled from AppSettings (default: true)', () => {
        expect(capturedSsaoPass!.enabled).toBe(true)
    })

    it('initializes SSAOPass.enabled false when setting is disabled', () => {
        capturedSsaoPass = null
        AppSettings['instance'] = undefined as unknown as AppSettings
        vi.spyOn(AppSettings, 'get').mockReturnValue(false as never)

        const p = new RenderPipelineManager(renderer, scene, camera)
        expect(capturedSsaoPass!.enabled).toBe(false)
        p.dispose()
        vi.restoreAllMocks()
    })

    it('delegates render() to EffectComposer', () => {
        pipeline.render()
        expect(capturedComposer!.render).toHaveBeenCalledOnce()
    })

    it('resizes both composer and SSAOPass on setSize()', () => {
        pipeline.setSize(1280, 720)
        expect(capturedComposer!.setSize).toHaveBeenCalledWith(1280, 720)
        expect(capturedSsaoPass!.setSize).toHaveBeenCalledWith(1280, 720)
    })

    it('toggles SSAOPass.enabled via setSsaoEnabled()', () => {
        pipeline.setSsaoEnabled(false)
        expect(capturedSsaoPass!.enabled).toBe(false)

        pipeline.setSsaoEnabled(true)
        expect(capturedSsaoPass!.enabled).toBe(true)
    })

    it('disposes SSAOPass and composer on dispose()', () => {
        pipeline.dispose()
        expect(capturedSsaoPass!.dispose).toHaveBeenCalledOnce()
        expect(capturedComposer!.dispose).toHaveBeenCalledOnce()
    })
})
