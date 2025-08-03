/**
 * Performance profiling utility for standardized timing measurements
 * Works with Logger system for configurable performance monitoring
 */

import { Logger } from './Logger'

export class PerformanceProfiler {
    private static readonly logger = Logger.withContext('Performance')
    private timers: Map<string, number> = new Map()

    /**
     * Start timing an operation
     */
    start(operation: string): void {
        this.timers.set(operation, window.performance.now())
    }

    /**
     * End timing and log the duration
     */
    end(operation: string, context?: string): number {
        const startTime = this.timers.get(operation)
        if (startTime === undefined) {
            PerformanceProfiler.logger.warn(`No start time found for operation: ${operation}`)
            return 0
        }

        const duration = window.performance.now() - startTime
        const message = context 
            ? `${operation}: ${duration.toFixed(2)}ms (${context})`
            : `${operation}: ${duration.toFixed(2)}ms`
        
        PerformanceProfiler.logger.info(`⏱️ ${message}`)
        this.timers.delete(operation)
        return duration
    }

    /**
     * Measure an async operation
     */
    async measure<T>(operation: string, fn: () => Promise<T>, context?: string): Promise<T> {
        this.start(operation)
        try {
            const result = await fn()
            this.end(operation, context)
            return result
        } catch (error) {
            this.end(operation, `${context ? context + ' - ' : ''}FAILED`)
            throw error
        }
    }

    /**
     * Measure a synchronous operation
     */
    measureSync<T>(operation: string, fn: () => T, context?: string): T {
        this.start(operation)
        try {
            const result = fn()
            this.end(operation, context)
            return result
        } catch (error) {
            this.end(operation, `${context ? context + ' - ' : ''}FAILED`)
            throw error
        }
    }

    /**
     * Log a timing result without using the timer system
     */
    static logTiming(operation: string, duration: number, context?: string): void {
        const message = context 
            ? `${operation}: ${duration.toFixed(2)}ms (${context})`
            : `${operation}: ${duration.toFixed(2)}ms`
        
        PerformanceProfiler.logger.info(`⏱️ ${message}`)
    }

    /**
     * Log a summary with total time
     */
    static logSummary(operation: string, totalTime: number): void {
        PerformanceProfiler.logger.info(`🎯 ${operation}: ${totalTime.toFixed(2)}ms`)
    }
}

// Export a default instance for convenience
export const performanceProfiler = new PerformanceProfiler()
