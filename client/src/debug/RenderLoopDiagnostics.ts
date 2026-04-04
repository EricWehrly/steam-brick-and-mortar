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
}

export class RenderLoopDiagnostics {
    private static isInitialized = false
    private static config: Required<DiagnosticsConfig> = {
        enabled: false,
        logInterval: 60,
        frameTimeWarnThreshold: 16.67,
        callbackTimeWarnThreshold: 5
    }
    
    private static stats: FrameStats = {
        frameCount: 0,
        totalFrameTime: 0,
        maxFrameTime: 0,
        callbackTimes: new Map(),
        frameStartTime: 0
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
        
        // Set instrumentation wrapper - registry owns the iteration
        registry.setInstrumentation(this.instrumentCallback.bind(this))
        
        
        this.isInitialized = true
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
        // Track frame start on first callback
        if (this.isFirstCallbackInFrame) {
            this.stats.frameStartTime = performance.now()
            this.isFirstCallbackInFrame = false
        }
        
        const callbackStart = performance.now()
        try {
            callback(now, deltaTime)
        } catch (error) {
            console.error(`🔧 [RenderLoopDiagnostics] Error in callback '${id}':`, error)
        }
        const callbackTime = performance.now() - callbackStart
        
        // Track per-callback times
        if (!this.stats.callbackTimes.has(id)) {
            this.stats.callbackTimes.set(id, [])
        }
        const times = this.stats.callbackTimes.get(id)
        if (times) {
            times.push(callbackTime)
            if (times.length > this.config.logInterval) {
                times.shift()
            }
        }
        
        // Warn if callback is slow
        if (callbackTime > this.config.callbackTimeWarnThreshold) {
            console.warn(`⚠️ [RenderLoopDiagnostics] Slow callback '${id}': ${callbackTime.toFixed(2)}ms`)
        }
    }
    
    /**
     * Called at end of each frame to finalize stats
     * Must be called by the render loop after executeAll()
     */
    public static endFrame(): void {
        if (!this.config.enabled || this.isFirstCallbackInFrame) {
            return // No callbacks executed this frame
        }
        
        const frameTime = performance.now() - this.stats.frameStartTime
        this.stats.frameCount++
        this.stats.totalFrameTime += frameTime
        this.stats.maxFrameTime = Math.max(this.stats.maxFrameTime, frameTime)
        this.isFirstCallbackInFrame = true // Reset for next frame
        
        // Warn if frame is slow
        if (frameTime > this.config.frameTimeWarnThreshold) {
            console.warn(`⚠️ [RenderLoopDiagnostics] Slow frame: ${frameTime.toFixed(2)}ms`)
        }
        
        // Periodic logging
        if (this.stats.frameCount % this.config.logInterval === 0) {
            this.logStats()
        }
    }

    private static logStats(): void {
        const avgFrameTime = this.stats.totalFrameTime / this.config.logInterval
        
        // Only log if there's something noteworthy (>1ms avg or any callback >1ms)
        const hasSlowCallbacks = Array.from(this.stats.callbackTimes.values()).some(times => {
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            return avg >= 1.0
        })
        
        if (avgFrameTime < 1.0 && !hasSlowCallbacks) {
            // Reset and skip logging - everything is fast
            this.stats.totalFrameTime = 0
            this.stats.maxFrameTime = 0
            return
        }
        
        console.log(`📊 [RenderLoopDiagnostics] Frame Stats (last ${this.config.logInterval} frames):`)
        console.log(`   Avg: ${avgFrameTime.toFixed(2)}ms, Max: ${this.stats.maxFrameTime.toFixed(2)}ms`)
        
        // Log per-callback averages (only those >= 1ms)
        for (const [id, times] of this.stats.callbackTimes.entries()) {
            const avg = times.reduce((a, b) => a + b, 0) / times.length
            const max = Math.max(...times)
            if (avg >= 1.0 || max >= 1.0) {
                console.log(`   ${id}: avg ${avg.toFixed(2)}ms, max ${max.toFixed(2)}ms`)
            }
        }
        
        // Reset for next interval
        this.stats.totalFrameTime = 0
        this.stats.maxFrameTime = 0
    }

    /**
     * Get current stats (for UI display or testing)
     */
    public static getStats(): Readonly<Omit<FrameStats, 'frameStartTime'>> {
        return { 
            frameCount: this.stats.frameCount,
            totalFrameTime: this.stats.totalFrameTime,
            maxFrameTime: this.stats.maxFrameTime,
            callbackTimes: new Map(this.stats.callbackTimes) 
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
        this.stats = {
            frameCount: 0,
            totalFrameTime: 0,
            maxFrameTime: 0,
            callbackTimes: new Map(),
            frameStartTime: 0
        }
    }
}
