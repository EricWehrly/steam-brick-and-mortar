import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceTimer } from '../../../src/utils/PerformanceTimer'
import type { LogFunctions } from '../../../src/utils/PerformanceTimer'

describe('PerformanceTimer', () => {
    let mockLogger: LogFunctions
    let logCalls: { level: string; message: string }[]

    beforeEach(() => {
        logCalls = []
        mockLogger = {
            error: vi.fn((...args: unknown[]) => {
                logCalls.push({ level: 'error', message: args.join(' ') })
            }),
            warn: vi.fn((...args: unknown[]) => {
                logCalls.push({ level: 'warn', message: args.join(' ') })
            }),
            info: vi.fn((...args: unknown[]) => {
                logCalls.push({ level: 'info', message: args.join(' ') })
            }),
            debug: vi.fn((...args: unknown[]) => {
                logCalls.push({ level: 'debug', message: args.join(' ') })
            })
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Basic Timing', () => {
        it('should measure elapsed time', () => {
            const timer = PerformanceTimer.start('Test operation', mockLogger)
            
            // Simulate some work
            const start = performance.now()
            while (performance.now() - start < 10) {
                // Wait ~10ms
            }
            
            const elapsed = timer.getElapsed()
            expect(elapsed).toBeGreaterThanOrEqual(10)
            expect(elapsed).toBeLessThan(100) // Reasonable upper bound
        })

        it('should log completion with operation name', () => {
            const timer = PerformanceTimer.start('Load games', mockLogger)
            timer.end()
            
            expect(logCalls).toHaveLength(1)
            expect(logCalls[0].message).toContain('Load games')
            expect(logCalls[0].message).toMatch(/\d+\.\d+ms/)
        })

        it('should use debug level by default', () => {
            const timer = PerformanceTimer.start('Test operation', mockLogger)
            timer.end()
            
            expect(logCalls[0].level).toBe('debug')
            expect(mockLogger.debug).toHaveBeenCalled()
        })
    })

    describe('Threshold-Based Warnings', () => {
        it('should log warning when exceeding default threshold', () => {
            const timer = PerformanceTimer.start('Slow operation', mockLogger)
            
            // Simulate work exceeding 100ms threshold
            const start = performance.now()
            while (performance.now() - start < 110) {
                // Wait ~110ms
            }
            
            timer.end()
            
            expect(logCalls[0].level).toBe('warn')
            expect(logCalls[0].message).toContain('⚠️ Main thread blocking!')
        })

        it('should use custom threshold', () => {
            const timer = PerformanceTimer.start('Fast operation', mockLogger)
            
            // Simulate work just under 50ms threshold
            const start = performance.now()
            while (performance.now() - start < 45) {
                // Wait ~45ms
            }
            
            timer.end({}, { threshold: 50 })
            
            expect(logCalls[0].level).toBe('debug')
        })

        it('should use custom threshold and exceed it', () => {
            const timer = PerformanceTimer.start('Custom threshold test', mockLogger)
            
            // Simulate work exceeding 20ms threshold
            const start = performance.now()
            while (performance.now() - start < 25) {
                // Wait ~25ms
            }
            
            timer.end({}, { threshold: 20 })
            
            expect(logCalls[0].level).toBe('warn')
        })

        it('should use custom warning message', () => {
            const timer = PerformanceTimer.start('Critical path', mockLogger)
            
            // Exceed threshold
            const start = performance.now()
            while (performance.now() - start < 110) {
                // Wait ~110ms
            }
            
            timer.end({}, { warningMessage: '🚨 Performance critical!' })
            
            expect(logCalls[0].level).toBe('warn')
            expect(logCalls[0].message).toContain('🚨 Performance critical!')
        })
    })

    describe('Context Tagging', () => {
        it('should add MAIN THREAD context prefix', () => {
            const timer = PerformanceTimer.start('UI update', mockLogger)
            timer.end({}, { context: 'MAIN THREAD' })
            
            expect(logCalls[0].message).toContain('[MAIN THREAD]')
        })

        it('should add ASYNC context prefix', () => {
            const timer = PerformanceTimer.start('Network fetch', mockLogger)
            timer.end({}, { context: 'ASYNC' })
            
            expect(logCalls[0].message).toContain('[ASYNC]')
        })

        it('should work without context prefix', () => {
            const timer = PerformanceTimer.start('Generic operation', mockLogger)
            timer.end()
            
            expect(logCalls[0].message).not.toContain('[MAIN THREAD]')
            expect(logCalls[0].message).not.toContain('[ASYNC]')
        })
    })

    describe('Metadata Formatting', () => {
        it('should format single metadata value', () => {
            const timer = PerformanceTimer.start('Load games', mockLogger)
            timer.end({ count: 42 })
            
            expect(logCalls[0].message).toContain('(count: 42)')
        })

        it('should format multiple metadata values', () => {
            const timer = PerformanceTimer.start('Batch processing', mockLogger)
            timer.end({ batch: 3, total: 10, size: 18 })
            
            const message = logCalls[0].message
            expect(message).toContain('batch: 3')
            expect(message).toContain('total: 10')
            expect(message).toContain('size: 18')
        })

        it('should format floating point numbers with precision', () => {
            const timer = PerformanceTimer.start('Calculation', mockLogger)
            timer.end({ avgTime: 123.456789 })
            
            expect(logCalls[0].message).toContain('avgTime: 123.5')
        })

        it('should format integer numbers without decimals', () => {
            const timer = PerformanceTimer.start('Count items', mockLogger)
            timer.end({ count: 100 })
            
            expect(logCalls[0].message).toContain('count: 100')
            expect(logCalls[0].message).not.toContain('count: 100.0')
        })

        it('should format string metadata', () => {
            const timer = PerformanceTimer.start('Process batch', mockLogger)
            timer.end({ status: 'success', batch: '1/5' })
            
            const message = logCalls[0].message
            expect(message).toContain('status: success')
            expect(message).toContain('batch: 1/5')
        })

        it('should handle empty metadata', () => {
            const timer = PerformanceTimer.start('Test operation', mockLogger)
            timer.end({})
            
            expect(logCalls[0].message).not.toContain('(')
            expect(logCalls[0].message).not.toContain(')')
        })

        it('should handle undefined metadata', () => {
            const timer = PerformanceTimer.start('Test operation', mockLogger)
            timer.end()
            
            expect(logCalls[0].message).not.toContain('(')
            expect(logCalls[0].message).not.toContain(')')
        })
    })

    describe('Log Levels', () => {
        it('should use info level when specified', () => {
            const timer = PerformanceTimer.start('Important operation', mockLogger)
            timer.end({}, { level: 'info' })
            
            expect(logCalls[0].level).toBe('info')
            expect(mockLogger.info).toHaveBeenCalled()
        })

        it('should use debug level when specified', () => {
            const timer = PerformanceTimer.start('Debug operation', mockLogger)
            timer.end({}, { level: 'debug' })
            
            expect(logCalls[0].level).toBe('debug')
            expect(mockLogger.debug).toHaveBeenCalled()
        })

        it('should always use warn when threshold exceeded regardless of level setting', () => {
            const timer = PerformanceTimer.start('Slow operation', mockLogger)
            
            // Exceed threshold
            const start = performance.now()
            while (performance.now() - start < 110) {
                // Wait ~110ms
            }
            
            timer.end({}, { level: 'info', threshold: 100 })
            
            expect(logCalls[0].level).toBe('warn')
            expect(mockLogger.warn).toHaveBeenCalled()
        })
    })

    describe('Nested Timers', () => {
        it('should create child timer from parent', () => {
            const parentTimer = PerformanceTimer.start('Parent operation', mockLogger)
            const childTimer = parentTimer.startChild('Child operation')
            
            childTimer.end()
            parentTimer.end()
            
            expect(logCalls).toHaveLength(2)
            expect(logCalls[0].message).toContain('Child operation')
            expect(logCalls[1].message).toContain('Parent operation')
        })

        it('should allow child timer to complete independently', () => {
            const parentTimer = PerformanceTimer.start('Parent operation', mockLogger)
            
            const child1 = parentTimer.startChild('Child 1')
            child1.end({ step: 1 })
            
            const child2 = parentTimer.startChild('Child 2')
            child2.end({ step: 2 })
            
            parentTimer.end()
            
            expect(logCalls).toHaveLength(3)
            expect(logCalls[0].message).toContain('Child 1')
            expect(logCalls[1].message).toContain('Child 2')
            expect(logCalls[2].message).toContain('Parent operation')
        })

        it('should inherit logger from parent timer', () => {
            const parentTimer = PerformanceTimer.start('Parent', mockLogger)
            const childTimer = parentTimer.startChild('Child')
            
            childTimer.end()
            
            expect(mockLogger.debug).toHaveBeenCalled()
        })
    })

    describe('Complete Usage Scenarios', () => {
        it('should handle typical main thread timing pattern', () => {
            const timer = PerformanceTimer.start('Built cached games', mockLogger)
            
            // Simulate fast main thread work
            const start = performance.now()
            while (performance.now() - start < 50) {
                // Wait ~50ms
            }
            
            timer.end({ count: 150 }, { threshold: 100, context: 'MAIN THREAD' })
            
            const message = logCalls[0].message
            expect(message).toContain('[MAIN THREAD]')
            expect(message).toContain('Built cached games')
            expect(message).toContain('count: 150')
            expect(logCalls[0].level).toBe('debug') // Under threshold
        })

        it('should handle typical async timing pattern', () => {
            const timer = PerformanceTimer.start('Background metadata fetch', mockLogger)
            
            // Simulate fast async work
            const start = performance.now()
            while (performance.now() - start < 30) {
                // Wait ~30ms
            }
            
            timer.end({ count: 50 }, { context: 'ASYNC', level: 'info' })
            
            const message = logCalls[0].message
            expect(message).toContain('[ASYNC]')
            expect(message).toContain('Background metadata fetch')
            expect(message).toContain('count: 50')
            expect(logCalls[0].level).toBe('info')
        })

        it('should handle batch processing with iterations', () => {
            const batchTimer = PerformanceTimer.start('Process all batches', mockLogger)
            
            for (let i = 0; i < 3; i++) {
                const iterTimer = batchTimer.startChild('Batch iteration')
                
                // Simulate work
                const start = performance.now()
                while (performance.now() - start < 5) {
                    // Wait ~5ms
                }
                
                iterTimer.end()
            }
            
            batchTimer.end({ batchCount: 3 })
            
            expect(logCalls).toHaveLength(4) // 3 children + 1 parent
            expect(logCalls[3].message).toContain('batchCount: 3')
        })

        it('should handle warning with context and metadata', () => {
            const timer = PerformanceTimer.start('Slow batch emission', mockLogger)
            
            // Exceed threshold
            const start = performance.now()
            while (performance.now() - start < 600) {
                // Wait ~600ms
            }
            
            timer.end({
                mainThread: 550,
                async: 50,
                avgPerBatch: 183.3
            }, { threshold: 500, context: 'MAIN THREAD' })
            
            const message = logCalls[0].message
            expect(logCalls[0].level).toBe('warn')
            expect(message).toContain('[MAIN THREAD]')
            expect(message).toContain('mainThread: 550')
            expect(message).toContain('async: 50')
            expect(message).toContain('avgPerBatch: 183.3')
            expect(message).toContain('⚠️')
        })
    })

    describe('Edge Cases', () => {
        it('should handle zero elapsed time', () => {
            const timer = PerformanceTimer.start('Instant operation', mockLogger)
            timer.end()
            
            const elapsed = timer.getElapsed()
            expect(elapsed).toBeGreaterThanOrEqual(0)
            expect(logCalls[0].message).toMatch(/\d+\.\d+ms/)
        })

        it('should handle very long operation names', () => {
            const longName = 'A'.repeat(200)
            const timer = PerformanceTimer.start(longName, mockLogger)
            timer.end()
            
            expect(logCalls[0].message).toContain(longName)
        })

        it('should handle special characters in operation name', () => {
            const timer = PerformanceTimer.start('Load "quoted" items: 100%', mockLogger)
            timer.end()
            
            expect(logCalls[0].message).toContain('Load "quoted" items: 100%')
        })

        it('should handle very small threshold values', () => {
            const timer = PerformanceTimer.start('Ultra-fast check', mockLogger)
            
            // Any real work will exceed 1ms
            const start = performance.now()
            while (performance.now() - start < 2) {
                // Wait ~2ms
            }
            
            timer.end({}, { threshold: 1 })
            
            expect(logCalls[0].level).toBe('warn')
        })

        it('should handle extremely large threshold values', () => {
            const timer = PerformanceTimer.start('Long operation', mockLogger)
            timer.end({}, { threshold: 999999 })
            
            expect(logCalls[0].level).toBe('debug')
        })

        it('should handle null-like metadata values', () => {
            const timer = PerformanceTimer.start('Test operation', mockLogger)
            timer.end({ value: null, other: undefined, zero: 0 })
            
            const message = logCalls[0].message
            expect(message).toContain('value: null')
            expect(message).toContain('other: undefined')
            expect(message).toContain('zero: 0')
        })
    })
})
