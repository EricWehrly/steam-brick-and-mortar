import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'
import { EventManager } from '../../../src/core/EventManager'

let capturedComposer: {
    passes: unknown[]
    addPass: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
} | null = null

let capturedN8aoPass: {
    enabled: boolean
    configuration: Record<string, unknown>
    setSize: ReturnType<typeof vi.fn>
    setQualityMode: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
} | null = null

let capturedEffectPasses: { dispose: ReturnType<typeof vi.fn> }[] = []

vi.mock('postprocessing', () => ({
    EffectComposer: function MockEffectComposer() {
        const passes: unknown[] = []
        capturedComposer = {
            passes,
            addPass: vi.fn().mockImplementation((pass: unknown) => passes.push(pass)),
            render: vi.fn(),
            setSize: vi.fn(),
            dispose: vi.fn(),
        }
        return capturedComposer
    },
    RenderPass: function MockRenderPass() { return { _type: 'RenderPass' } },
    EffectPass: function MockEffectPass() {
        const pass = { _type: 'EffectPass', dispose: vi.fn() }
        capturedEffectPasses.push(pass)
        return pass
    },
    SMAAEffect: function MockSMAAEffect() { return {} },
    ToneMappingEffect: function MockToneMappingEffect() { return {} },
    ToneMappingMode: { AGX: 'AGX' },
    SMAAPreset: { LOW: 0, MEDIUM: 1, HIGH: 2, ULTRA: 3 },
    Pass: class MockPass {},
}))

vi.mock('n8ao', () => ({
    N8AOPostPass: function MockN8AOPostPass() {
        capturedN8aoPass = {
            enabled: true,
            configuration: {
                aoRadius: 0,
                intensity: 0,
                distanceFalloff: 0,
                gammaCorrection: true,
            },
            setSize: vi.fn(),
            setQualityMode: vi.fn(),
            dispose: vi.fn(),
        }
        return capturedN8aoPass
    },
}))

import { RenderPipelineManager } from '../../../src/scene/RenderPipelineManager'
import { AppSettingsEventTypes } from '../../../src/types/InteractionEvents'
import { EventSource } from '../../../src/core/EventManager'

function emitSettingChanged(settingName: string, value: unknown): void {
    EventManager.getInstance().emit(AppSettingsEventTypes.Changed, { settingName, value, source: EventSource.System })
}

describe('RenderPipelineManager', () => {
    let pipeline: RenderPipelineManager
    let renderer: THREE.WebGLRenderer
    let scene: THREE.Scene
    let camera: THREE.PerspectiveCamera

    beforeEach(() => {
        capturedComposer = null
        capturedN8aoPass = null
        capturedEffectPasses = []
        localStorage.clear()
        AppSettings['instance'] = undefined as unknown as AppSettings
        EventManager['instance'] = undefined as unknown as EventManager

        renderer = {} as unknown as THREE.WebGLRenderer
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera()
        pipeline = new RenderPipelineManager(renderer, scene, camera)
    })

    it('adds 4 passes to the composer (RenderPass, N8AOPostPass, ToneMappingEffect, SMAAEffect)', () => {
        expect(capturedComposer!.addPass).toHaveBeenCalledTimes(4)
    })

    it('initializes N8AOPostPass.enabled from AppSettings (default: true)', () => {
        expect(capturedN8aoPass!.enabled).toBe(true)
    })

    it('initializes N8AOPostPass.enabled false when ssaoEnabled setting is false', () => {
        capturedN8aoPass = null
        capturedEffectPasses = []
        AppSettings['instance'] = undefined as unknown as AppSettings
        vi.spyOn(AppSettings, 'get').mockReturnValue(false as never)

        const p = new RenderPipelineManager(renderer, scene, camera)
        expect(capturedN8aoPass!.enabled).toBe(false)
        p.dispose()
        vi.restoreAllMocks()
    })

    it('delegates render() to EffectComposer', () => {
        pipeline.render()
        expect(capturedComposer!.render).toHaveBeenCalledOnce()
    })

    it('delegates setSize() to EffectComposer only (composer fans out to registered passes)', () => {
        pipeline.setSize(1280, 720)
        expect(capturedComposer!.setSize).toHaveBeenCalledWith(1280, 720)
        // n8aoPass must NOT be resized directly here — EffectComposer.setSize() already
        // resizes every pass in composer.passes using the drawing buffer size. A second,
        // separate call using CSS-pixel dimensions would undersize N8AO's internal
        // buffers whenever devicePixelRatio !== 1.
        expect(capturedN8aoPass!.setSize).not.toHaveBeenCalled()
    })

    it('toggles N8AOPostPass.enabled when ssaoEnabled setting changes', () => {
        emitSettingChanged('ssaoEnabled', false)
        expect(capturedN8aoPass!.enabled).toBe(false)

        emitSettingChanged('ssaoEnabled', true)
        expect(capturedN8aoPass!.enabled).toBe(true)
    })

    it('disposes old SMAA EffectPass and adds a new one when smaaPreset setting changes', () => {
        const smaaPassBeforeRebuild = capturedEffectPasses[1]
        const passCountBefore = capturedComposer!.passes.length

        emitSettingChanged('smaaPreset', 'low')

        expect(smaaPassBeforeRebuild.dispose).toHaveBeenCalledOnce()
        expect(capturedEffectPasses).toHaveLength(3)
        expect(capturedComposer!.passes.length).toBe(passCountBefore)
    })

    it('disposes the composer on dispose()', () => {
        pipeline.dispose()
        expect(capturedComposer!.dispose).toHaveBeenCalledOnce()
    })
})
