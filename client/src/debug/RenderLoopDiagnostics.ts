/**
 * Zero-Overhead Render Loop Diagnostics
 * 
 * This module uses RenderLoopRegistry's instrumentation hook to provide
 * per-frame timing diagnostics. The registry owns the iteration over callbacks,
 * keeping its internal structure encapsulated.
 * 
 * - If diagnostics disabled: No instrumentation set, zero overhead
 * - If diagnostics enabled: Wrapper with timing, ~0.1ms overhead per frame
 * 
 * Usage:
 *   // At app startup, BEFORE render loop starts:
 *   RenderLoopDiagnostics.initialize({ enabled: true, logInterval: 60 })
 */

import type * as THREE from 'three'
import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import type { RenderLoopCallback } from '../scene/RenderLoopRegistry'
import type { RenderPipelineManager, DiagnosticsRenderTarget } from '../scene/RenderPipelineManager'

/** Three.js runs the shadow-map pass inside renderer.render(), which pmndrs RenderPass
 *  calls internally — so this stage's time is a subset of pipeline:renderPass, not a
 *  sibling cost. Don't sum stage totals expecting them to equal the frame total. */
const SHADOW_MAP_STAGE_ID = 'pipeline:shadowMap'

export interface CaptureStageStat {
    /** Average time per occurrence within the capture window (ms) */
    avg: number
    /** Slowest single occurrence within the capture window (ms) */
    max: number
    /** All-time peak for this id, not scoped to the window (ms) */
    peak: number
    /** Sum of all occurrences within the capture window (ms) */
    total: number
    /** avg expressed as % of the configured frame-time budget */
    percentOfFrameBudget: number
}

export interface CaptureReport {
    durationMs: number
    frameCount: number
    avgFrameTime: number
    maxFrameTime: number
    slowFrameCount: number
    longTaskCount: number
    stages: Record<string, CaptureStageStat>
}

export interface DiagnosticsConfig {
    /** Enable diagnostics (default: false for production) */
    enabled: boolean
    /** Log frame stats every N frames (default: 60 = ~1 second) */
    logInterval?: number
    /** Warn if frame time exceeds this (ms, default: 16.67 for 60fps) */
    frameTimeWarnThreshold?: number
    /** Warn if any callback exceeds this (ms, default: 5) */
    callbackTimeWarnThreshold?: number
}

interface FrameStats {
    frameCount: number
    totalFrameTime: number
    maxFrameTime: number
    callbackTimes: Map<string, number[]>
    frameStartTime: number
    /** All-time peak frame time — never reset by logStats() */
    peakFrameTime: number
    /** All-time peak per-callback times — never reset by logStats() */
    peakCallbackTimes: Map<string, number>
    /** How many frames exceeded frameTimeWarnThreshold */
    slowFrameCount: number
}

export class RenderLoopDiagnostics {
    private static isInitialized = false
    private static config: Required<DiagnosticsConfig> = {
        enabled: false,
        logInterval: 60,
        frameTimeWarnThreshold: 16.67,
        callbackTimeWarnThreshold: 5
    }
    
    private static longTaskObserver: PerformanceObserver | null = null
    private static longTaskCount = 0
    private static instrumentedTargets = new WeakSet<object>()

    private static captureStartTime: number | null = null
    private static captureFrameCountBaseline = 0
    private static captureSlowFrameBaseline = 0
    private static captureLongTaskBaseline = 0
    private static captureFrameTimeTotal = 0
    private static captureFrameTimeMax = 0
    private static captureIdTotals: Map<string, { total: number; max: number; count: number }> = new Map()

    private static stats: FrameStats = {
        frameCount: 0,
        totalFrameTime: 0,
        maxFrameTime: 0,
        callbackTimes: new Map(),
        frameStartTime: 0,
        peakFrameTime: 0,
        peakCallbackTimes: new Map(),
        slowFrameCount: 0,
    }
    
    private static isFirstCallbackInFrame = true

    /**
     * Initialize diagnostics - call ONCE at app startup, before render loop starts
     */
    public static initialize(config?: Partial<DiagnosticsConfig>): void {
        if (this.isInitialized) {
            console.warn('🔧 [RenderLoopDiagnostics] Already initialized, ignoring')
            return
        }
        
        this.config = { ...this.config, ...config }
        
        if (!this.config.enabled) {
            
            this.isInitialized = true
            return
        }
        
        const registry = RenderLoopRegistry.getInstance()
        
        // Set instrumentation hooks - registry owns the iteration
        registry.setInstrumentation({
            onBeforeFrame: this.beginFrame.bind(this),
            wrapCallback: this.instrumentCallback.bind(this),
            onAfterRender: this.endFrame.bind(this),
        })

        // PerformanceObserver catches long tasks that happen between frames
        // (click handlers, event callbacks, etc.) — invisible to RenderLoopRegistry.
        // These are the source of "opens fine, but subsequent frames run slow" bugs.
        if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.longTaskCount++
                    console.warn(
                        `⚠️ [RenderLoopDiagnostics] Long task between frames: ${entry.duration.toFixed(1)}ms`
                    )
                }
            })
            observer.observe({ type: 'longtask', buffered: true })
            this.longTaskObserver = observer
        }

        this.isInitialized = true;

        ;(window as any).renderLoopDiagnostics = this
    }

    /**
     * Wires per-stage timing onto the composer passes and the shadow-map render, so
     * endFrame()'s previously-opaque "full frame" number breaks down into which stage
     * costs what. No-ops when diagnostics are disabled — call after initialize().
     */
    public static attachRenderPipeline(
        renderPipelineManager: RenderPipelineManager,
        renderer: THREE.WebGLRenderer
    ): void {
        if (!this.config.enabled) {
            return
        }
        renderPipelineManager.setPassInstrumentor(this.instrumentRenderStage.bind(this))
        this.instrumentRenderStage(SHADOW_MAP_STAGE_ID, renderer.shadowMap as unknown as DiagnosticsRenderTarget)
    }

    private static instrumentRenderStage(id: string, target: DiagnosticsRenderTarget): void {
        if (this.instrumentedTargets.has(target)) {
            return
        }
        const originalRender = target.render.bind(target)
        target.render = (...args: unknown[]) => {
            const start = performance.now()
            const result = originalRender(...args)
            this.recordTiming(id, performance.now() - start)
            return result
        }
        this.instrumentedTargets.add(target)
    }

    /**
     * Called at the very start of each frame (onBeforeFrame hook).
     * Stamps the wall-clock time before any callbacks or render work.
     */
    private static beginFrame(): void {
        this.stats.frameStartTime = performance.now()
        this.isFirstCallbackInFrame = true
    }

    /**
     * Instrumentation wrapper called by RenderLoopRegistry for each callback
     */
    private static instrumentCallback(
        id: string,
        callback: RenderLoopCallback,
        now: number,
        deltaTime: number
    ): void {
        this.isFirstCallbackInFrame = false

        const callbackStart = performance.now()
        try {
            callback(now, deltaTime)
        } catch (error) {
            console.error(`🔧 [RenderLoopDiagnostics] Error in callback '${id}':`, error)
        }
        this.recordTiming(id, performance.now() - callbackStart)
    }

    /**
     * Shared timing sink for render-loop callbacks, composer passes, and the shadow-map
     * render — all recorded under the same id-keyed structures so getStats()/report() see
     * a uniform set of "things that cost frame time," not a callback-only view.
     */
    private static recordTiming(id: string, duration: number): void {
        // Track rolling window for periodic averages
        if (!this.stats.callbackTimes.has(id)) {
            this.stats.callbackTimes.set(id, [])
        }
        const times = this.stats.callbackTimes.get(id)!
        times.push(duration)
        if (times.length > this.config.logInterval) {
            times.shift()
        }

        // Track all-time peak — never cleared
        const currentPeak = this.stats.peakCallbackTimes.get(id) ?? 0
        if (duration > currentPeak) {
            this.stats.peakCallbackTimes.set(id, duration)
        }

        // Warn on individual slow occurrences
        if (duration > this.config.callbackTimeWarnThreshold) {
            console.warn(
                `⚠️ [RenderLoopDiagnostics] Slow '${id}': ${duration.toFixed(2)}ms`
            )
        }

        if (this.captureStartTime !== null) {
            const entry = this.captureIdTotals.get(id) ?? { total: 0, max: 0, count: 0 }
            entry.total += duration
            entry.count += 1
            entry.max = Math.max(entry.max, duration)
            this.captureIdTotals.set(id, entry)
        }
    }

    /**
     * Called after renderer.render() (onAfterFrame).
     * Measures the FULL frame: callbacks + GPU submission.
     */
    public static endFrame(): void {
        if (!this.config.enabled || this.stats.frameStartTime === 0) {
            return
        }
        
        const frameTime = performance.now() - this.stats.frameStartTime
        this.stats.frameCount++
        this.stats.totalFrameTime += frameTime
        this.stats.maxFrameTime = Math.max(this.stats.maxFrameTime, frameTime)

        // All-time peaks are never cleared by logStats()
        if (frameTime > this.stats.peakFrameTime) {
            this.stats.peakFrameTime = frameTime
        }

        if (this.captureStartTime !== null) {
            this.captureFrameTimeTotal += frameTime
            this.captureFrameTimeMax = Math.max(this.captureFrameTimeMax, frameTime)
        }

        this.stats.frameStartTime = 0 // Reset sentinel
        
        // Warn on individual slow frames — this fires regardless of logStats() clearing
        if (frameTime > this.config.frameTimeWarnThreshold) {
            this.stats.slowFrameCount++
            console.warn(
                `⚠️ [RenderLoopDiagnostics] Slow frame #${this.stats.frameCount}: ` +
                `${frameTime.toFixed(2)}ms (budget: ${this.config.frameTimeWarnThreshold}ms)`
            )
        }
        
        // Periodic rolling summary
        if (this.stats.frameCount % this.config.logInterval === 0) {
            this.logStats()
        }
    }

    private static logStats(): void {
        const avgFrameTime = this.stats.totalFrameTime / this.config.logInterval
        
        const hasSlowCallbacks = Array.from(this.stats.callbackTimes.values()).some(times => {
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            return avg >= 1.0
        })
        
        // Always reset rolling window, but only log if something is worth seeing
        const windowMaxFrameTime = this.stats.maxFrameTime
        this.stats.totalFrameTime = 0
        this.stats.maxFrameTime = 0

        if (avgFrameTime < 1.0 && !hasSlowCallbacks) {
            return
        }
        
        console.log(
            `📊 [RenderLoopDiagnostics] Frame Stats (last ${this.config.logInterval} frames):` +
            ` avg ${avgFrameTime.toFixed(2)}ms, max ${windowMaxFrameTime.toFixed(2)}ms` +
            ` | peak all-time: ${this.stats.peakFrameTime.toFixed(2)}ms` +
            ` | slow frames: ${this.stats.slowFrameCount}`
        )
        
        // Log per-callback averages (only those >= 0.5ms avg or with a peak spike)
        for (const [id, times] of this.stats.callbackTimes.entries()) {
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            const windowMax = Math.max(...times)
            const peak = this.stats.peakCallbackTimes.get(id) ?? 0
            if (avg >= 0.5 || peak >= this.config.callbackTimeWarnThreshold) {
                console.log(
                    `   ${id}: avg ${avg.toFixed(2)}ms, max ${windowMax.toFixed(2)}ms, peak ${peak.toFixed(2)}ms`
                )
            }
        }
    }

    /**
     * Get current stats snapshot (for UI display or console inspection).
     * callbackAvgs is keyed by callback id — averaged over the rolling window.
     * peakCallbackTimes is all-time peak per callback (never reset).
     */
    public static getStats(): {
        frameCount: number
        peakFrameTime: number
        slowFrameCount: number
        callbackAvgs: Record<string, { avg: number; peak: number }>
    } {
        const callbackAvgs: Record<string, { avg: number; peak: number }> = {}
        for (const [id, times] of this.stats.callbackTimes.entries()) {
            const avg = times.length > 0
                ? times.reduce((a, b) => a + b, 0) / times.length
                : 0
            callbackAvgs[id] = {
                avg: parseFloat(avg.toFixed(3)),
                peak: parseFloat((this.stats.peakCallbackTimes.get(id) ?? 0).toFixed(3)),
            }
        }
        return {
            frameCount: this.stats.frameCount,
            peakFrameTime: this.stats.peakFrameTime,
            slowFrameCount: this.stats.slowFrameCount,
            callbackAvgs,
        }
    }

    /**
     * Begin a capture window: report() will summarize everything recorded since this call.
     * Safe to call again to restart the window: attachRenderPipeline()'s wrapping stays
     * installed across restarts since it's a one-time setup, not part of the capture state.
     */
    public static startCapture(): void {
        this.captureStartTime = performance.now()
        this.captureFrameCountBaseline = this.stats.frameCount
        this.captureSlowFrameBaseline = this.stats.slowFrameCount
        this.captureLongTaskBaseline = this.longTaskCount
        this.captureFrameTimeTotal = 0
        this.captureFrameTimeMax = 0
        this.captureIdTotals = new Map()
        console.log('📸 [RenderLoopDiagnostics] Capture started — call report() when ready')
    }

    /**
     * Summarize everything recorded since the last startCapture(). Callable repeatedly
     * without restarting — each call reports the window "since start," not "since last report."
     */
    public static report(): CaptureReport | null {
        if (this.captureStartTime === null) {
            console.warn('⚠️ [RenderLoopDiagnostics] No capture in progress — call startCapture() first')
            return null
        }

        const durationMs = performance.now() - this.captureStartTime
        const frameCount = this.stats.frameCount - this.captureFrameCountBaseline
        const avgFrameTime = frameCount > 0 ? this.captureFrameTimeTotal / frameCount : 0
        const frameBudget = this.config.frameTimeWarnThreshold

        const stages: Record<string, CaptureStageStat> = {}
        for (const [id, entry] of this.captureIdTotals.entries()) {
            const avg = entry.count > 0 ? entry.total / entry.count : 0
            stages[id] = {
                avg: parseFloat(avg.toFixed(3)),
                max: parseFloat(entry.max.toFixed(3)),
                peak: parseFloat((this.stats.peakCallbackTimes.get(id) ?? 0).toFixed(3)),
                total: parseFloat(entry.total.toFixed(2)),
                percentOfFrameBudget: parseFloat(((avg / frameBudget) * 100).toFixed(1)),
            }
        }

        const report: CaptureReport = {
            durationMs: parseFloat(durationMs.toFixed(1)),
            frameCount,
            avgFrameTime: parseFloat(avgFrameTime.toFixed(3)),
            maxFrameTime: parseFloat(this.captureFrameTimeMax.toFixed(3)),
            slowFrameCount: this.stats.slowFrameCount - this.captureSlowFrameBaseline,
            longTaskCount: this.longTaskCount - this.captureLongTaskBaseline,
            stages,
        }

        console.log(
            `📊 [RenderLoopDiagnostics] Capture report — ${(durationMs / 1000).toFixed(1)}s, ` +
            `${frameCount} frames, avg ${report.avgFrameTime}ms, max ${report.maxFrameTime}ms, ` +
            `${report.slowFrameCount} slow frames, ${report.longTaskCount} long tasks`
        )
        console.table(
            Object.fromEntries(
                Object.entries(stages).map(([id, s]) => [id, {
                    'avg ms': s.avg,
                    'max ms': s.max,
                    'peak ms (all-time)': s.peak,
                    '% of budget': s.percentOfFrameBudget,
                }])
            )
        )

        return report
    }

    /**
     * Disable diagnostics and remove instrumentation
     */
    public static disable(): void {
        if (!this.config.enabled) {
            return
        }
        
        const registry = RenderLoopRegistry.getInstance()
        registry.setInstrumentation(null)
        this.config.enabled = false
        
    }

    /**
     * Reset for testing
     */
    public static reset(): void {
        const registry = RenderLoopRegistry.getInstance()
        registry.setInstrumentation(null)
        this.isInitialized = false
        this.config = {
            enabled: false,
            logInterval: 60,
            frameTimeWarnThreshold: 16.67,
            callbackTimeWarnThreshold: 5
        }
        this.longTaskObserver?.disconnect()
        this.longTaskObserver = null
        this.longTaskCount = 0
        this.instrumentedTargets = new WeakSet<object>()
        this.captureStartTime = null
        this.captureFrameCountBaseline = 0
        this.captureSlowFrameBaseline = 0
        this.captureLongTaskBaseline = 0
        this.captureFrameTimeTotal = 0
        this.captureFrameTimeMax = 0
        this.captureIdTotals = new Map()
        this.stats = {
            frameCount: 0,
            totalFrameTime: 0,
            maxFrameTime: 0,
            callbackTimes: new Map(),
            frameStartTime: 0,
            peakFrameTime: 0,
            peakCallbackTimes: new Map(),
            slowFrameCount: 0,
        }
    }
}
