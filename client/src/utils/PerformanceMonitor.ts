/**
 * Unified Performance Monitor
 * 
 * Single system for performance tracking that provides:
 * - Console logging with threshold warnings
 * - Main thread blocking detection
 * - Frame budget violation tracking
 * - Report generation for offline analysis
 * 
 * Replaces PerformanceTimer and MainThreadBlockingTracker with one consistent API.
 * 
 * Usage:
 * ```typescript
 * const monitor = PerformanceMonitor.start('batch-process', logger)
 * // ... do work ...
 * monitor.end({ batchIndex: 1 })
 * ```
 */

import { AppSettings, Setting } from '../core/AppSettings'

const TARGET_FRAME_TIME = 16.67 // 60 FPS budget in milliseconds
const DEFAULT_CONSOLE_THRESHOLD = 100 // Warn in console if operation > 100ms
const DEFAULT_BLOCKING_THRESHOLD = 33 // Flag as blocking if > 2 frames

export interface LogFunctions {
    error: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
}

export interface MonitorOptions {
    /** Console warning threshold in milliseconds (default: 100) */
    consoleThreshold?: number
    /** Blocking detection threshold in milliseconds (default: 33) */
    blockingThreshold?: number
    /** Thread context for log messages */
    context?: 'MAIN THREAD' | 'ASYNC'
    /** Initial metadata */
    metadata?: Record<string, unknown>
    /** Log level for non-warnings (default: 'debug') */
    level?: 'debug' | 'info'
}

/** Pre-configured context for async operations (network, cache, etc.) */
export const ASYNC_CONTEXT: MonitorOptions = {
    context: 'ASYNC',
    level: 'info'
}

/** Pre-configured context for main thread operations */
export const MAIN_THREAD_CONTEXT: MonitorOptions = {
    context: 'MAIN THREAD'
}

export interface BlockingOperation {
    name: string
    startTime: number
    endTime: number
    duration: number
    metadata?: Record<string, unknown>
    severity: 'normal' | 'warning' | 'critical'
}

export interface FrameViolation {
    frameNumber: number
    duration: number
    overbudget: number
    timestamp: number
    operations: string[]
}

export interface PerformanceReport {
    metadata: {
        userAgent: string
        timestamp: string
        duration: number
        url: string
    }
    operations: BlockingOperation[]
    frameViolations: FrameViolation[]
    summary: {
        totalOperations: number
        warningOperations: number
        criticalOperations: number
        totalFrameViolations: number
        longestBlock: BlockingOperation | null
    }
}

class PerformanceMonitorInstance {
    private operation: string
    private logger: LogFunctions
    private startTime: number
    private options: Required<MonitorOptions>
    
    constructor(operation: string, logger: LogFunctions, options: MonitorOptions = {}) {
        this.operation = operation
        this.logger = logger
        this.startTime = performance.now()
        this.options = {
            consoleThreshold: options.consoleThreshold ?? DEFAULT_CONSOLE_THRESHOLD,
            blockingThreshold: options.blockingThreshold ?? DEFAULT_BLOCKING_THRESHOLD,
            context: options.context ?? undefined as any,
            metadata: options.metadata ?? {},
            level: options.level ?? 'debug'
        }

        // Start blocking detection if enabled
        if (PerformanceMonitor.isBlockingDetectionEnabled()) {
            PerformanceMonitor.startOperation(operation, this.options.metadata)
        }

        // Create performance mark for browser DevTools
        performance.mark(`${operation}-start`)
    }

    getElapsed(): number {
        return performance.now() - this.startTime
    }

    end(metadata?: Record<string, unknown>): void {
        const elapsed = this.getElapsed()
        const allMetadata = { ...this.options.metadata, ...metadata }

        // Create performance measure for browser DevTools
        performance.mark(`${this.operation}-end`)
        performance.measure(this.operation, `${this.operation}-start`, `${this.operation}-end`)

        // Console logging (always happens)
        this.logResult(elapsed, allMetadata)

        // Blocking detection (only if enabled)
        if (PerformanceMonitor.isBlockingDetectionEnabled()) {
            PerformanceMonitor.endOperation(this.operation, elapsed, allMetadata, this.options.blockingThreshold)
        }
    }

    private logResult(elapsed: number, metadata: Record<string, unknown>): void {
        const contextPrefix = this.options.context ? `[${this.options.context}] ` : ''
        const metadataStr = this.formatMetadata(metadata)
        const baseMsg = `${contextPrefix}${this.operation}: ${elapsed.toFixed(1)}ms${metadataStr}`

        if (elapsed > this.options.consoleThreshold) {
            this.logger.warn(`${baseMsg} ⚠️`)
        } else {
            this.logger[this.options.level](baseMsg)
        }
    }

    private formatMetadata(metadata: Record<string, unknown>): string {
        if (Object.keys(metadata).length === 0) return ''
        
        const parts = Object.entries(metadata).map(([key, value]) => {
            if (typeof value === 'number') {
                return `${key}: ${value}`
            }
            return `${key}: ${value}`
        })
        
        return ` (${parts.join(', ')})`
    }
}

export class PerformanceMonitor {
    private static operations: BlockingOperation[] = []
    private static activeOperations = new Map<string, { startTime: number; metadata?: Record<string, unknown> }>()
    private static activeOperationNames = new Set<string>()
    
    // Frame tracking
    private static frameViolations: FrameViolation[] = []
    private static frameStart = 0
    private static frameNumber = 0
    private static isFrameTracking = false
    private static rafId: number | null = null
    private static isPageVisible = true
    
    // Tracking state
    private static isTracking = false
    private static trackingStartTime = 0

    static {
        // Setup page visibility tracking
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                PerformanceMonitor.isPageVisible = !document.hidden
                if (!PerformanceMonitor.isPageVisible) {
                    PerformanceMonitor.frameStart = 0
                }
            })
            PerformanceMonitor.isPageVisible = !document.hidden
        }
    }

    static isBlockingDetectionEnabled(): boolean {
        return AppSettings.get(Setting.EnableBlockingTracker)
    }

    static start(operation: string, logger: LogFunctions, options?: MonitorOptions): PerformanceMonitorInstance {
        // Start tracking if this is the first monitored operation and blocking detection is enabled
        if (!PerformanceMonitor.isTracking && PerformanceMonitor.isBlockingDetectionEnabled()) {
            PerformanceMonitor.startTracking()
        }

        return new PerformanceMonitorInstance(operation, logger, options)
    }

    private static startTracking(): void {
        if (this.isTracking) return

        this.isTracking = true
        this.trackingStartTime = performance.now()
        this.operations = []
        this.frameViolations = []
        this.activeOperations.clear()
        this.activeOperationNames.clear()
        this.frameNumber = 0

        this.startFrameTracking()
    }

    static stopTracking(): PerformanceReport {
        this.isTracking = false
        this.stopFrameTracking()
        return this.generateReport()
    }

    /** @internal - Internal utility, do not call directly */
    static startOperation(name: string, metadata?: Record<string, unknown>): void {
        const id = `${name}-${performance.now()}`
        this.activeOperations.set(id, {
            startTime: performance.now(),
            metadata
        })
        this.activeOperationNames.add(name)
    }

    /** @internal - Internal utility, do not call directly */
    static endOperation(
        name: string,
        duration: number,
        metadata: Record<string, unknown>,
        blockingThreshold: number
    ): void {
        // Find most recent operation with this name
        const id = Array.from(this.activeOperations.keys())
            .reverse()
            .find(k => k.startsWith(name))

        if (!id) return

        const active = this.activeOperations.get(id)!

        // Determine severity based on blocking threshold
        let severity: BlockingOperation['severity'] = 'normal'
        if (duration > blockingThreshold * 2) {
            severity = 'critical'
        } else if (duration > blockingThreshold) {
            severity = 'warning'
        }

        const operation: BlockingOperation = {
            name,
            startTime: active.startTime,
            endTime: active.startTime + duration,
            duration,
            metadata,
            severity
        }

        this.operations.push(operation)
        this.activeOperations.delete(id)
        this.activeOperationNames.delete(name)
    }

    private static startFrameTracking(): void {
        if (this.isFrameTracking) return

        this.isFrameTracking = true
        this.scheduleNextFrame()
    }

    private static stopFrameTracking(): void {
        this.isFrameTracking = false
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId)
            this.rafId = null
        }
    }

    private static scheduleNextFrame(): void {
        if (!this.isFrameTracking) return

        this.rafId = requestAnimationFrame((timestamp) => {
            if (!this.isPageVisible) {
                this.frameStart = 0
                this.scheduleNextFrame()
                return
            }

            if (this.frameStart > 0) {
                const frameDuration = timestamp - this.frameStart

                if (frameDuration > TARGET_FRAME_TIME) {
                    const activeOps = Array.from(this.activeOperationNames)
                    
                    this.frameViolations.push({
                        frameNumber: this.frameNumber,
                        duration: frameDuration,
                        overbudget: frameDuration - TARGET_FRAME_TIME,
                        timestamp,
                        operations: activeOps
                    })
                }
            }

            this.frameStart = timestamp
            this.frameNumber++
            this.scheduleNextFrame()
        })
    }

    private static generateReport(): PerformanceReport {
        const endTime = performance.now()
        
        const warningOps = this.operations.filter(op => op.severity === 'warning')
        const criticalOps = this.operations.filter(op => op.severity === 'critical')
        const longestBlock = this.operations.length > 0
            ? this.operations.reduce((max, op) => op.duration > max.duration ? op : max)
            : null

        return {
            metadata: {
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                duration: endTime - this.trackingStartTime,
                url: window.location.href
            },
            operations: this.operations,
            frameViolations: this.frameViolations,
            summary: {
                totalOperations: this.operations.length,
                warningOperations: warningOps.length,
                criticalOperations: criticalOps.length,
                totalFrameViolations: this.frameViolations.length,
                longestBlock
            }
        }
    }

    static getReport(): PerformanceReport {
        return this.generateReport()
    }

    static downloadReport(filename = 'performance-report.json'): void {
        const report = this.getReport()
        const json = JSON.stringify(report, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()

        URL.revokeObjectURL(url)
    }

    static getStats() {
        return {
            isTracking: this.isTracking,
            totalOperations: this.operations.length,
            warningOperations: this.operations.filter(op => op.severity === 'warning').length,
            criticalOperations: this.operations.filter(op => op.severity === 'critical').length,
            frameViolations: this.frameViolations.length,
            activeOperations: this.activeOperations.size
        }
    }

    static reset(): void {
        this.operations = []
        this.frameViolations = []
        this.activeOperations.clear()
        this.activeOperationNames.clear()
        this.frameNumber = 0
    }
}
