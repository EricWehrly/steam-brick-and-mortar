import type { Logger } from './Logger'

export interface LogFunctions {
    error: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
}

export interface TimerOptions {
    /** Warning threshold in milliseconds (default: 100) */
    threshold?: number
    /** Thread context prefix */
    context?: 'MAIN THREAD' | 'ASYNC'
    /** Custom warning suffix (default: "⚠️ Main thread blocking!") */
    warningMessage?: string
    /** Log level for non-warnings (default: 'debug') */
    level?: 'debug' | 'info'
}

/**
 * Fluent API for performance timing with automatic logging
 * 
 * Handles common timing patterns:
 * - Start/end measurements
 * - Threshold-based warnings
 * - Consistent log formatting
 * - Thread context tagging
 * - Nested timers
 * 
 * @example
 * ```typescript
 * const timer = PerformanceTimer.start('Load games', logger)
 * // ... do work ...
 * timer.end({ count: 100 }, { threshold: 100, context: 'MAIN THREAD' })
 * // Output: "[MAIN THREAD] Load games: 45.2ms (count: 100)"
 * ```
 */
export class PerformanceTimer {
    private startTime: number
    private operation: string
    private logger: LogFunctions
    private parent?: PerformanceTimer

    private constructor(operation: string, logger: LogFunctions, parent?: PerformanceTimer) {
        this.operation = operation
        this.logger = logger
        this.parent = parent
        this.startTime = performance.now()
    }

    /**
     * Start a new performance timer
     * @param operation - Human-readable operation name
     * @param logger - Logger instance to use for output
     */
    static start(operation: string, logger: LogFunctions): PerformanceTimer {
        return new PerformanceTimer(operation, logger)
    }

    /**
     * Get elapsed time without ending the timer
     */
    getElapsed(): number {
        return performance.now() - this.startTime
    }

    /**
     * End the timer and log results
     * @param metadata - Dynamic data for message (e.g., { count: 42 })
     * @param options - Logging configuration
     */
    end(metadata?: Record<string, unknown>, options: TimerOptions = {}): void {
        const elapsed = this.getElapsed()
        const {
            threshold = 100,
            context,
            warningMessage = '⚠️ Main thread blocking!',
            level = 'debug'
        } = options

        const contextPrefix = context ? `[${context}] ` : ''
        const metadataStr = metadata ? this.formatMetadata(metadata) : ''
        const baseMsg = `${contextPrefix}${this.operation}: ${elapsed.toFixed(1)}ms${metadataStr}`

        if (elapsed > threshold) {
            this.logger.warn(`${baseMsg} ${warningMessage}`)
        } else {
            this.logger[level](baseMsg)
        }
    }

    /**
     * Create a child timer for nested operations
     */
    startChild(operation: string): PerformanceTimer {
        return new PerformanceTimer(operation, this.logger, this)
    }

    /**
     * Format metadata object as string for logging
     */
    private formatMetadata(metadata: Record<string, unknown>): string {
        const entries = Object.entries(metadata)
        if (entries.length === 0) return ''

        const parts = entries.map(([key, value]) => {
            if (typeof value === 'number' && !Number.isInteger(value)) {
                return `${key}: ${(value as number).toFixed(1)}`
            }
            return `${key}: ${value}`
        })

        return ` (${parts.join(', ')})`
    }
}
