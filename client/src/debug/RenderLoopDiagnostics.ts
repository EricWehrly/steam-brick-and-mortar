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

import { RenderLoopRegistry } from '../scene/RenderLoopRegistry'
import type { RenderLoopCallback } from '../scene/RenderLoopRegistry'

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
    /** How many long tasks (> 50ms between frames) were detected via PerformanceObserver */
    longTaskCount: number
    /** Peak long task duration in ms */
    maxLongTaskDuration: number
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

    private static stats: FrameStats = {
        frameCount: 0,
        totalFrameTime: 0,
        maxFrameTime: 0,
        callbackTimes: new Map(),
        frameStartTime: 0,
        peakFrameTime: 0,
        peakCallbackTimes: new Map(),
        slowFrameCount: 0,
        longTaskCount: 0,
        maxLongTaskDuration: 0,
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
            onAfterFrame: this.endCallbacks.bind(this),
            onAfterRender: this.endFrame.bind(this),
        })

        // PerformanceObserver catches long tasks that happen between frames
        // (click handlers, event callbacks, etc.) — invisible to RenderLoopRegistry.
        // These are the source of "opens fine, but subsequent frames run slow" bugs.
        if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.stats.longTaskCount++
                    this.stats.maxLongTaskDuration = Math.max(this.stats.maxLongTaskDuration, entry.duration)
                    console.warn(
                        `⚠️ [RenderLoopDiagnostics] Long task between frames: ${entry.duration.toFixed(1)}ms` +
                        (entry.attribution?.length
                            ? ` (${entry.attribution.map((a: PerformanceEntry & { containerName?: string; containerSrc?: string }) => a.containerName || a.containerSrc || 'unknown').join(', ')})`
                            : '')
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
        const callbackTime = performance.now() - callbackStart
        
        // Track rolling window for periodic averages
        if (!this.stats.callbackTimes.has(id)) {
            this.stats.callbackTimes.set(id, [])
        }
        const times = this.stats.callbackTimes.get(id)!
        times.push(callbackTime)
        if (times.length > this.config.logInterval) {
            times.shift()
        }

        // Track all-time peak per callback — never cleared
        const currentPeak = this.stats.peakCallbackTimes.get(id) ?? 0
        if (callbackTime > currentPeak) {
            this.stats.peakCallbackTimes.set(id, callbackTime)
        }
        
        // Warn on individual slow callbacks
        if (callbackTime > this.config.callbackTimeWarnThreshold) {
            console.warn(
                `⚠️ [RenderLoopDiagnostics] Slow callback '${id}': ${callbackTime.toFixed(2)}ms`
            )
        }
    }
    
    /**
     * Called after all callbacks execute (onAfterFrame). Resets callback guard.
     */
    private static endCallbacks(): void {
        this.isFirstCallbackInFrame = false
    }

    /**
     * Called after renderer.render() (onAfterRender).
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
        totalFrameTime: number
        maxFrameTime: number
        peakFrameTime: number
        slowFrameCount: number
        longTaskCount: number
        maxLongTaskDuration: number
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
            totalFrameTime: this.stats.totalFrameTime,
            maxFrameTime: this.stats.maxFrameTime,
            peakFrameTime: this.stats.peakFrameTime,
            slowFrameCount: this.stats.slowFrameCount,
            longTaskCount: this.stats.longTaskCount,
            maxLongTaskDuration: this.stats.maxLongTaskDuration,
            callbackAvgs,
        }
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
        this.stats = {
            frameCount: 0,
            totalFrameTime: 0,
            maxFrameTime: 0,
            callbackTimes: new Map(),
            frameStartTime: 0,
            peakFrameTime: 0,
            peakCallbackTimes: new Map(),
            slowFrameCount: 0,
            longTaskCount: 0,
            maxLongTaskDuration: 0,
        }
    }
}
