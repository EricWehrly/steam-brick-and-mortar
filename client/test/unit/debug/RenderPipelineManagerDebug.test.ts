import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { AppSettings } from '../../../src/core/AppSettings'
import { EventManager, EventSource } from '../../../src/core/EventManager'
import { AppSettingsEventTypes } from '../../../src/types/InteractionEvents'
import { UrlUtils } from '../../../src/utils/UrlUtils'
import { RenderLoopDiagnostics } from '../../../src/debug/RenderLoopDiagnostics'

let capturedComposer: {
    passes: { render: () => void }[]
    addPass: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    setSize: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    multisampling: number
} | null = null

let capturedN8aoPass: {
    enabled: boolean
    configuration: Record<string, unknown>
    render: () => void
    setSize: ReturnType<typeof vi.fn>
    setQualityMode: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
} | null = null

let capturedEffectPasses: { dispose: ReturnType<typeof vi.fn>; render: () => void }[] = []

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

vi.mock('postprocessing', () => ({
    EffectComposer: function MockEffectComposer() {
        const passes: { render: () => void }[] = []
        capturedComposer = {
            passes,
            addPass: vi.fn().mockImplementation((pass: { render: () => void }) => passes.push(pass)),
            render: vi.fn(),
            setSize: vi.fn(),
            dispose: vi.fn(),
            multisampling: 0,
        }
        return capturedComposer
    },
    RenderPass: function MockRenderPass() { return { _type: 'RenderPass', render: vi.fn() } },
    EffectPass: function MockEffectPass() {
        const pass = { _type: 'EffectPass', dispose: vi.fn(), render: vi.fn() }
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
            render: vi.fn(),
            setSize: vi.fn(),
            setQualityMode: vi.fn(),
            dispose: vi.fn(),
        }
        return capturedN8aoPass
    },
}))

import { RenderPipelineManagerDebug } from '../../../src/debug/RenderPipelineManagerDebug'

function emitSettingChanged(settingName: string, value: unknown): void {
    EventManager.getInstance().emit(AppSettingsEventTypes.Changed, { settingName, value, source: EventSource.System })
}

function makeFakeRenderer(): THREE.WebGLRenderer {
    return {
        shadowMap: { render: vi.fn() },
        // jsdom has no real WebGL2RenderingContext, so the constructor's own GPU-timer
        // detection never fires — tests needing GPU timing inject a fake one directly.
        getContext: vi.fn().mockReturnValue(null),
    } as unknown as THREE.WebGLRenderer
}

describe('RenderPipelineManagerDebug', () => {
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
        RenderLoopDiagnostics.reset()
        mockAppSettingsGet()

        renderer = makeFakeRenderer()
        scene = new THREE.Scene()
        camera = new THREE.PerspectiveCamera()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        RenderLoopDiagnostics.reset()
    })

    it('does not wrap any pass when diagnostics are disabled', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(false)
        const recordSpy = vi.spyOn(RenderLoopDiagnostics, 'recordTiming')

        const pipeline = new RenderPipelineManagerDebug(renderer, scene, camera)
        capturedN8aoPass!.render()
        ;(renderer.shadowMap.render as () => void)()
        pipeline.render()

        expect(recordSpy).not.toHaveBeenCalled()
        expect(capturedComposer!.render).toHaveBeenCalledOnce()
    })

    it('wraps all 4 composer passes and the shadow map when diagnostics are enabled', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        RenderLoopDiagnostics.initialize({ enabled: true })
        const recordSpy = vi.spyOn(RenderLoopDiagnostics, 'recordTiming')

        new RenderPipelineManagerDebug(renderer, scene, camera)
        capturedComposer!.passes[0].render() // renderPass
        capturedN8aoPass!.render()
        capturedEffectPasses[0].render() // toneMappingPass
        capturedEffectPasses[1].render() // smaaPass
        ;(renderer.shadowMap.render as () => void)()

        const ids = recordSpy.mock.calls.map(call => call[0])
        expect(ids).toEqual(expect.arrayContaining([
            'pipeline:renderPass', 'pipeline:n8ao', 'pipeline:toneMapping', 'pipeline:smaa', 'pipeline:shadowMap',
        ]))
    })

    it('re-wraps the rebuilt SMAA pass after a smaaPreset setting change', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        RenderLoopDiagnostics.initialize({ enabled: true })
        const recordSpy = vi.spyOn(RenderLoopDiagnostics, 'recordTiming')

        new RenderPipelineManagerDebug(renderer, scene, camera)
        emitSettingChanged('smaaPreset', 'low')
        recordSpy.mockClear()

        const rebuiltSmaaPass = capturedEffectPasses[capturedEffectPasses.length - 1]
        rebuiltSmaaPass.render()

        expect(recordSpy).toHaveBeenCalledWith('pipeline:smaa', expect.any(Number))
    })

    it('records real GPU time under pipeline:n8ao:gpu when a GPU timer is attached', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        RenderLoopDiagnostics.initialize({ enabled: true })
        const recordSpy = vi.spyOn(RenderLoopDiagnostics, 'recordTiming')

        const pipeline = new RenderPipelineManagerDebug(renderer, scene, camera)
        const fakeGpuTimer = {
            isSupported: true,
            measure: (work: () => void, onResult: (ms: number) => void) => {
                work()
                onResult(7.5)
            },
            poll: vi.fn(),
            dispose: vi.fn(),
        }
        ;(pipeline as unknown as { gpuTimerQuery: unknown }).gpuTimerQuery = fakeGpuTimer

        capturedN8aoPass!.render()

        const gpuCalls = recordSpy.mock.calls.filter(call => call[0] === 'pipeline:n8ao:gpu')
        expect(gpuCalls).toHaveLength(1)
        expect(gpuCalls[0][1]).toBeCloseTo(7.5, 3)
    })

    it('does not GPU-time stages outside the GPU-timed set even when a GPU timer is attached', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        RenderLoopDiagnostics.initialize({ enabled: true })

        const pipeline = new RenderPipelineManagerDebug(renderer, scene, camera)
        const fakeGpuTimer = { isSupported: true, measure: vi.fn(), poll: vi.fn(), dispose: vi.fn() }
        ;(pipeline as unknown as { gpuTimerQuery: unknown }).gpuTimerQuery = fakeGpuTimer

        capturedEffectPasses[1].render() // smaaPass — not in the GPU-timed set

        expect(fakeGpuTimer.measure).not.toHaveBeenCalled()
    })

    it('polls the GPU timer once per render() call before delegating to the base render', () => {
        vi.spyOn(UrlUtils, 'isDiagnosticsEnabled').mockReturnValue(true)
        RenderLoopDiagnostics.initialize({ enabled: true })

        const pipeline = new RenderPipelineManagerDebug(renderer, scene, camera)
        const fakeGpuTimer = { isSupported: true, measure: vi.fn(), poll: vi.fn(), dispose: vi.fn() }
        ;(pipeline as unknown as { gpuTimerQuery: unknown }).gpuTimerQuery = fakeGpuTimer

        pipeline.render()

        expect(fakeGpuTimer.poll).toHaveBeenCalledOnce()
        expect(capturedComposer!.render).toHaveBeenCalledOnce()
    })
})
