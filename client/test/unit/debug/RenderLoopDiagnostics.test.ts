import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RenderLoopDiagnostics } from '../../../src/debug/RenderLoopDiagnostics'
import { RenderLoopRegistry } from '../../../src/scene/RenderLoopRegistry'
import type { PassInstrumentor, DiagnosticsRenderTarget } from '../../../src/scene/RenderPipelineManager'

function silenceConsole(): void {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'table').mockImplementation(() => {})
}

function runFrame(registry: RenderLoopRegistry, now: number, deltaTime: number): void {
    registry.executeAll(now, deltaTime)
    registry.afterRender()
}

describe('RenderLoopDiagnostics', () => {
    let registry: RenderLoopRegistry

    beforeEach(() => {
        RenderLoopDiagnostics.reset()
        RenderLoopRegistry.dispose()
        registry = RenderLoopRegistry.getInstance()
    })

    afterEach(() => {
        RenderLoopDiagnostics.reset()
        RenderLoopRegistry.dispose()
        vi.restoreAllMocks()
    })

    it('report() warns and returns null when no capture has started', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const report = RenderLoopDiagnostics.report()

        expect(report).toBeNull()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('only counts frames recorded after startCapture(), not before', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        registry.register('cb', () => {})
        runFrame(registry, 0, 16)
        runFrame(registry, 16, 16)

        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 32, 16)
        runFrame(registry, 48, 16)
        runFrame(registry, 64, 16)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        expect(report!.frameCount).toBe(3)
    })

    it('report() is callable repeatedly without restarting the capture window', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        registry.register('cb', () => {})

        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 0, 16)
        silenceConsole()
        expect(RenderLoopDiagnostics.report()!.frameCount).toBe(1)

        runFrame(registry, 16, 16)
        expect(RenderLoopDiagnostics.report()!.frameCount).toBe(2)
    })

    it('breaks down per-id timing under stages, keyed by callback id', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        registry.register('slowCallback', () => {
            const until = performance.now() + 2
            while (performance.now() < until) { /* busy-wait */ }
        })

        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 0, 16)
        runFrame(registry, 16, 16)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        expect(report!.stages['slowCallback']).toBeDefined()
        expect(report!.stages['slowCallback'].avg).toBeGreaterThan(0)
        expect(report!.stages['slowCallback'].total).toBeGreaterThan(0)
        expect(report!.stages['slowCallback'].percentOfFrameBudget).toBeGreaterThan(0)
    })

    it('attachRenderPipeline is a no-op when diagnostics are disabled', () => {
        RenderLoopDiagnostics.initialize({ enabled: false })
        const fakePipeline = { setPassInstrumentor: vi.fn() }
        const fakeRenderer = { shadowMap: { render: vi.fn() } }

        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        expect(fakePipeline.setPassInstrumentor).not.toHaveBeenCalled()
    })

    it('wraps the shadow map render and records its cost under pipeline:shadowMap', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        const fakePipeline = { setPassInstrumentor: vi.fn() }
        const originalShadowRender = vi.fn()
        const fakeRenderer = { shadowMap: { render: originalShadowRender } }

        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        expect(fakeRenderer.shadowMap.render).not.toBe(originalShadowRender)

        RenderLoopDiagnostics.startCapture()
        fakeRenderer.shadowMap.render()
        fakeRenderer.shadowMap.render()

        expect(originalShadowRender).toHaveBeenCalledTimes(2)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()
        expect(report!.stages['pipeline:shadowMap']).toBeDefined()
    })

    it('does not re-wrap the shadow map on a second attachRenderPipeline call', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        const fakePipeline = { setPassInstrumentor: vi.fn() }
        const fakeRenderer = { shadowMap: { render: vi.fn() } }

        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )
        const wrappedAfterFirstAttach = fakeRenderer.shadowMap.render

        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        expect(fakeRenderer.shadowMap.render).toBe(wrappedAfterFirstAttach)
    })

    it('forwards the pass instrumentor to RenderPipelineManager.setPassInstrumentor', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        let capturedInstrumentor: PassInstrumentor | null = null
        const fakePipeline = {
            setPassInstrumentor: vi.fn((instrumentor: PassInstrumentor) => {
                capturedInstrumentor = instrumentor
            })
        }
        const fakeRenderer = { shadowMap: { render: vi.fn() } }

        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        expect(fakePipeline.setPassInstrumentor).toHaveBeenCalledOnce()
        expect(capturedInstrumentor).not.toBeNull()

        const n8aoRender = vi.fn()
        const target: DiagnosticsRenderTarget = { render: n8aoRender }
        capturedInstrumentor!('pipeline:n8ao', target)

        RenderLoopDiagnostics.startCapture()
        target.render()

        silenceConsole()
        const report = RenderLoopDiagnostics.report()
        expect(report!.stages['pipeline:n8ao']).toBeDefined()
        expect(n8aoRender).toHaveBeenCalledOnce()
    })
})
