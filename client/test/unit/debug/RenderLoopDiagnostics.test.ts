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

    // These tests pin performance.now() to 0 so startCapture()'s real-clock captureStartTime
    // lands on the same timeline as the synthetic `now` values passed to runFrame() — without
    // this, bucket/timestamp math would compare synthetic frame timestamps against a real
    // (unrelated, much larger) clock reading. Frame-time bookkeeping itself uses the synthetic
    // `now`/`deltaTime` params directly, not performance.now(), so this only affects timestamp
    // alignment for capture start, not the deltaTime values under test.
    function pinClockToZero(): void {
        vi.spyOn(performance, 'now').mockReturnValue(0)
    }

    it('avgFrameTime reflects real deltaTime (frame cadence), not just CPU work time', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        pinClockToZero()
        // No registered callbacks and no real render work — if avgFrameTime were actually
        // measuring CPU work span (the bug this test guards against), it would read ~0.
        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 0, 16.8)
        runFrame(registry, 16.8, 16.8)
        runFrame(registry, 33.6, 16.8)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        expect(report!.avgFrameTime).toBeCloseTo(16.8, 1)
        expect(report!.maxFrameTime).toBeCloseTo(16.8, 1)
    })

    it('computes stddev across the capture window deltas', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        pinClockToZero()

        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 0, 10)
        runFrame(registry, 10, 20)
        runFrame(registry, 30, 10)
        runFrame(registry, 40, 20)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        // mean=15, deviations [-5,5,-5,5] -> variance=25 -> stddev=5
        expect(report!.stddevFrameTime).toBeCloseTo(5, 1)
    })

    it('counts a jitter event when frame-to-frame delta swings past the threshold', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        pinClockToZero()

        RenderLoopDiagnostics.startCapture()
        runFrame(registry, 0, 16)
        runFrame(registry, 16, 16.5) // small change, not jitter
        runFrame(registry, 32.5, 40) // big swing, jitter
        runFrame(registry, 72.5, 16) // big swing back, jitter

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        expect(report!.jitterEventCount).toBe(2)
    })

    it('buckets frames by elapsed second since capture start', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        pinClockToZero()

        RenderLoopDiagnostics.startCapture()
        // Two frames land in second 0, one crosses into second 1. deltaTime kept under
        // MAX_PLAUSIBLE_FRAME_TIME_MS - only `now` needs to cross the bucket boundary.
        runFrame(registry, 0, 50)
        runFrame(registry, 900, 50)
        runFrame(registry, 1200, 50)

        silenceConsole()
        const report = RenderLoopDiagnostics.report()

        expect(report!.buckets).toHaveLength(2)
        expect(report!.buckets[0].bucketIndex).toBe(0)
        expect(report!.buckets[0].frameCount).toBe(2)
        expect(report!.buckets[1].bucketIndex).toBe(1)
        expect(report!.buckets[1].frameCount).toBe(1)
    })

    it('does not console.warn per slow frame or per slow stage occurrence', () => {
        RenderLoopDiagnostics.initialize({ enabled: true, frameTimeWarnThreshold: 5 })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'table').mockImplementation(() => {})
        registry.register('cb', () => {})

        RenderLoopDiagnostics.startCapture()
        for (let i = 0; i < 5; i++) {
            runFrame(registry, i * 16, 16) // exceeds the 5ms threshold on every frame
        }

        const report = RenderLoopDiagnostics.report()

        expect(report!.slowFrameCount).toBe(5)
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('never prints automatically, no matter how many frames run — only report()/getStats() do', () => {
        RenderLoopDiagnostics.initialize({ enabled: true, frameTimeWarnThreshold: 1 })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const tableSpy = vi.spyOn(console, 'table').mockImplementation(() => {})
        registry.register('cb', () => {})

        // Past the old logInterval (60) auto-log boundary, twice over.
        for (let i = 0; i < 130; i++) {
            runFrame(registry, i * 16, 16)
        }

        expect(warnSpy).not.toHaveBeenCalled()
        expect(logSpy).not.toHaveBeenCalled()
        expect(tableSpy).not.toHaveBeenCalled()

        const stats = RenderLoopDiagnostics.getStats()
        expect(stats.frameCount).toBe(130)
        expect(stats.slowFrameCount).toBe(130)
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
        const fakeRenderer = { shadowMap: { render: vi.fn() }, getContext: vi.fn().mockReturnValue(null) }

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
        const fakeRenderer = { shadowMap: { render: originalShadowRender }, getContext: vi.fn().mockReturnValue(null) }

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
        const fakeRenderer = { shadowMap: { render: vi.fn() }, getContext: vi.fn().mockReturnValue(null) }

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
        const fakeRenderer = { shadowMap: { render: vi.fn() }, getContext: vi.fn().mockReturnValue(null) }

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

    it('records real GPU time under pipeline:n8ao:gpu when a GPU timer is attached', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        let capturedInstrumentor: PassInstrumentor | null = null
        const fakePipeline = {
            setPassInstrumentor: vi.fn((instrumentor: PassInstrumentor) => {
                capturedInstrumentor = instrumentor
            })
        }
        // jsdom has no real WebGL2RenderingContext, so attachRenderPipeline's own detection
        // never fires — inject a fake GPU timer directly to test instrumentRenderStage's
        // GPU-timed branch in isolation from that environment gap.
        const fakeGpuTimer = {
            isSupported: true,
            measure: (work: () => void, onResult: (ms: number) => void) => {
                work()
                onResult(7.5)
            },
            dispose: vi.fn(),
        }
        ;(RenderLoopDiagnostics as unknown as { gpuTimerQuery: unknown }).gpuTimerQuery = fakeGpuTimer

        const fakeRenderer = { shadowMap: { render: vi.fn() }, getContext: vi.fn().mockReturnValue(null) }
        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        const n8aoRender = vi.fn()
        const target: DiagnosticsRenderTarget = { render: n8aoRender }
        capturedInstrumentor!('pipeline:n8ao', target)

        RenderLoopDiagnostics.startCapture()
        target.render()

        silenceConsole()
        const report = RenderLoopDiagnostics.report()
        expect(report!.stages['pipeline:n8ao']).toBeDefined()
        expect(report!.stages['pipeline:n8ao:gpu']).toBeDefined()
        expect(report!.stages['pipeline:n8ao:gpu'].avg).toBeCloseTo(7.5, 3)
        expect(n8aoRender).toHaveBeenCalledOnce()
    })

    it('does not GPU-time stages outside GPU_TIMED_STAGE_IDS even when a GPU timer is attached', () => {
        RenderLoopDiagnostics.initialize({ enabled: true })
        let capturedInstrumentor: PassInstrumentor | null = null
        const fakePipeline = {
            setPassInstrumentor: vi.fn((instrumentor: PassInstrumentor) => {
                capturedInstrumentor = instrumentor
            })
        }
        const fakeGpuTimer = {
            isSupported: true,
            measure: vi.fn(),
            dispose: vi.fn(),
        }
        ;(RenderLoopDiagnostics as unknown as { gpuTimerQuery: unknown }).gpuTimerQuery = fakeGpuTimer

        const fakeRenderer = { shadowMap: { render: vi.fn() }, getContext: vi.fn().mockReturnValue(null) }
        RenderLoopDiagnostics.attachRenderPipeline(
            fakePipeline as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[0],
            fakeRenderer as unknown as Parameters<typeof RenderLoopDiagnostics.attachRenderPipeline>[1]
        )

        const smaaRender = vi.fn()
        const target: DiagnosticsRenderTarget = { render: smaaRender }
        capturedInstrumentor!('pipeline:smaa', target)

        RenderLoopDiagnostics.startCapture()
        target.render()

        expect(fakeGpuTimer.measure).not.toHaveBeenCalled()
        expect(smaaRender).toHaveBeenCalledOnce()
    })
})
