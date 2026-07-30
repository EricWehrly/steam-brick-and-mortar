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
    multisampling: number
} | null = null

let capturedN8aoPass: {
    enabled: boolean
    configuration: Record<string, unknown>
    setSize: ReturnType<typeof vi.fn>
    setQualityMode: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
} | null = null

const DEFAULT_MOCK_SETTINGS: Record<string, unknown> = {
    msaaLevel: 'low',
    smaaPreset: 'high',
    ssaoQuality: 1,
}

function mockAppSettingsGet(overrides: Record<string, unknown> = {}): void {
    vi.spyOn(AppSettings, 'get').mockImplementation(
        (key: string) => (overrides[key] ?? DEFAULT_MOCK_SETTINGS[key]) as never
    )
}

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
            multisampling: 0,
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

    it('initializes N8AOPostPass from AppSettings ssaoQuality (default level 1: 16 samples, half-res)', () => {
        expect(capturedN8aoPass!.enabled).toBe(true)
        expect(capturedN8aoPass!.configuration.aoSamples).toBe(16)
        expect(capturedN8aoPass!.configuration.halfRes).toBe(true)
    })

    it('initializes N8AOPostPass.enabled false when ssaoQuality is level 0 (Off)', () => {
        capturedN8aoPass = null
        capturedEffectPasses = []
        AppSettings['instance'] = undefined as unknown as AppSettings
        mockAppSettingsGet({ ssaoQuality: 0 })

        const p = new RenderPipelineManager(renderer, scene, camera)
        expect(capturedN8aoPass!.enabled).toBe(false)
        p.dispose()
        vi.restoreAllMocks()
    })

    it('applies the highest ssaoQuality level (64 samples, no half-res)', () => {
        capturedN8aoPass = null
        capturedEffectPasses = []
        AppSettings['instance'] = undefined as unknown as AppSettings
        mockAppSettingsGet({ ssaoQuality: 5 })

        const p = new RenderPipelineManager(renderer, scene, camera)
        expect(capturedN8aoPass!.enabled).toBe(true)
        expect(capturedN8aoPass!.configuration.aoSamples).toBe(64)
        expect(capturedN8aoPass!.configuration.halfRes).toBe(false)
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

    it('applies enabled/aoSamples/halfRes together when ssaoQuality setting changes', () => {
        emitSettingChanged('ssaoQuality', 0)
        expect(capturedN8aoPass!.enabled).toBe(false)

        emitSettingChanged('ssaoQuality', 5)
        expect(capturedN8aoPass!.enabled).toBe(true)
        expect(capturedN8aoPass!.configuration.aoSamples).toBe(64)
        expect(capturedN8aoPass!.configuration.halfRes).toBe(false)

        emitSettingChanged('ssaoQuality', 1)
        expect(capturedN8aoPass!.enabled).toBe(true)
        expect(capturedN8aoPass!.configuration.aoSamples).toBe(16)
        expect(capturedN8aoPass!.configuration.halfRes).toBe(true)
    })

    it('initializes composer.multisampling from AppSettings msaaLevel (default: low = 0 samples)', () => {
        expect(capturedComposer!.multisampling).toBe(0)
    })

    it('initializes composer.multisampling to 4 samples when msaaLevel is high', () => {
        capturedComposer = null
        AppSettings['instance'] = undefined as unknown as AppSettings
        vi.spyOn(AppSettings, 'get').mockImplementation((key: string) => (key === 'msaaLevel' ? 'high' : true) as never)

        const p = new RenderPipelineManager(renderer, scene, camera)
        expect(capturedComposer!.multisampling).toBe(4)
        p.dispose()
        vi.restoreAllMocks()
    })

    it('updates composer.multisampling when msaaLevel setting changes', () => {
        emitSettingChanged('msaaLevel', 'ultra')
        expect(capturedComposer!.multisampling).toBe(8)

        emitSettingChanged('msaaLevel', 'low')
        expect(capturedComposer!.multisampling).toBe(0)
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

    it('setPassInstrumentor() applies to all 4 passes immediately', () => {
        const instrumentor = vi.fn()
        pipeline.setPassInstrumentor(instrumentor)

        expect(instrumentor).toHaveBeenCalledTimes(4)
        const ids = instrumentor.mock.calls.map(call => call[0])
        expect(ids).toEqual(
            expect.arrayContaining(['pipeline:renderPass', 'pipeline:n8ao', 'pipeline:toneMapping', 'pipeline:smaa'])
        )
    })

    it('setPassInstrumentor(null) detaches without throwing', () => {
        pipeline.setPassInstrumentor(vi.fn())
        expect(() => pipeline.setPassInstrumentor(null)).not.toThrow()
    })

    it('re-applies the instrumentor to the rebuilt SMAA pass when smaaPreset changes', () => {
        const instrumentor = vi.fn()
        pipeline.setPassInstrumentor(instrumentor)
        instrumentor.mockClear()

        emitSettingChanged('smaaPreset', 'low')

        const smaaCalls = instrumentor.mock.calls.filter(call => call[0] === 'pipeline:smaa')
        expect(smaaCalls).toHaveLength(1)
        expect(smaaCalls[0][1]).toBe(capturedEffectPasses[capturedEffectPasses.length - 1])
    })
})
