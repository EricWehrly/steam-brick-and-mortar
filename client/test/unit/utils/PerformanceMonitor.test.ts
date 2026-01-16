import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceMonitor } from '../../../src/utils/PerformanceMonitor'
import { AppSettings, Setting } from '../../../src/core/AppSettings'

describe('PerformanceMonitor', () => {
    const mockLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn()
    }

    beforeEach(() => {
        vi.clearAllMocks()
        PerformanceMonitor.reset()
        vi.spyOn(AppSettings, 'get').mockReturnValue(true) // Enable blocking detection by default
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Basic Operation', () => {
        it('should log operation completion', () => {
            const monitor = PerformanceMonitor.start('test-op', mockLogger)
            monitor.end()

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/test-op: \d+\.\d+ms/)
            )
        })

        it('should include metadata in log', () => {
            const monitor = PerformanceMonitor.start('test-op', mockLogger)
            monitor.end({ count: 42, status: 'success' })

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/test-op: \d+\.\d+ms \(count: 42, status: success\)/)
            )
        })

        it('should measure elapsed time', () => {
            const monitor = PerformanceMonitor.start('test-op', mockLogger)
            const elapsed = monitor.getElapsed()

            expect(elapsed).toBeGreaterThanOrEqual(0)
        })
    })

    describe('Console Thresholds', () => {
        it('should use debug level for fast operations', async () => {
            const monitor = PerformanceMonitor.start('fast-op', mockLogger)
            monitor.end()

            expect(mockLogger.debug).toHaveBeenCalled()
            expect(mockLogger.warn).not.toHaveBeenCalled()
        })

        it('should warn for slow operations', async () => {
            const monitor = PerformanceMonitor.start('slow-op', mockLogger, {
                consoleThreshold: 0 // Force warning
            })
            await new Promise(resolve => setTimeout(resolve, 5))
            monitor.end()

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringMatching(/slow-op: \d+\.\d+ms.*⚠️/)
            )
        })

        it('should respect custom console threshold', async () => {
            const monitor = PerformanceMonitor.start('custom-threshold', mockLogger, {
                consoleThreshold: 1000 // High threshold
            })
            await new Promise(resolve => setTimeout(resolve, 5))
            monitor.end()

            expect(mockLogger.debug).toHaveBeenCalled()
            expect(mockLogger.warn).not.toHaveBeenCalled()
        })

        it('should use info level when specified', () => {
            const monitor = PerformanceMonitor.start('info-op', mockLogger, {
                level: 'info'
            })
            monitor.end()

            expect(mockLogger.info).toHaveBeenCalled()
            expect(mockLogger.debug).not.toHaveBeenCalled()
        })
    })

    describe('Context Prefixes', () => {
        it('should include MAIN THREAD context', () => {
            const monitor = PerformanceMonitor.start('main-op', mockLogger, {
                context: 'MAIN THREAD'
            })
            monitor.end()

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/\[MAIN THREAD\] main-op:/)
            )
        })

        it('should include ASYNC context', () => {
            const monitor = PerformanceMonitor.start('async-op', mockLogger, {
                context: 'ASYNC'
            })
            monitor.end()

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringMatching(/\[ASYNC\] async-op:/)
            )
        })
    })

    describe('Blocking Detection', () => {
        it('should track operations when blocking detection enabled', () => {
            const monitor = PerformanceMonitor.start('tracked-op', mockLogger)
            monitor.end({ test: 'data' })

            const report = PerformanceMonitor.getReport()
            // Fast operations (< 16ms) go to aggregatedOperations
            const allAggregated = [...report.mainThreadBlocking.aggregatedOperations, ...report.asyncOperations.aggregatedOperations]
            expect(allAggregated.length).toBeGreaterThan(0)
            const trackedOp = allAggregated.find(op => op.name === 'tracked-op')
            expect(trackedOp).toBeDefined()
            expect(trackedOp!.count).toBe(1)
        })

        it('should not track when blocking detection disabled', () => {
            vi.spyOn(AppSettings, 'get').mockReturnValue(false)

            const monitor = PerformanceMonitor.start('untracked-op', mockLogger)
            monitor.end()

            const report = PerformanceMonitor.getReport()
            const allOps = [...report.mainThreadBlocking.operations, ...report.asyncOperations.operations]
            const allAggregated = [...report.mainThreadBlocking.aggregatedOperations, ...report.asyncOperations.aggregatedOperations]
            expect(allOps).toHaveLength(0)
            expect(allAggregated).toHaveLength(0)
        })

        it('should classify operations by severity', async () => {
            // Normal operation (< threshold, but >= 16ms to appear in detailed ops)
            const normal = PerformanceMonitor.start('normal-op', mockLogger, {
                blockingThreshold: 100
            })
            await new Promise(resolve => setTimeout(resolve, 20))
            normal.end()

            // Warning operation (> threshold but < 2x threshold)  
            const warning = PerformanceMonitor.start('warning-op', mockLogger, {
                blockingThreshold: 5
            })
            await new Promise(resolve => setTimeout(resolve, 10))
            warning.end()

            // Critical operation (> 2x threshold)
            const critical = PerformanceMonitor.start('critical-op', mockLogger, {
                blockingThreshold: 5
            })
            await new Promise(resolve => setTimeout(resolve, 20))
            critical.end()

            const report = PerformanceMonitor.getReport()
            const allOps = [...report.mainThreadBlocking.operations, ...report.asyncOperations.operations]
            const allAggregated = [...report.mainThreadBlocking.aggregatedOperations, ...report.asyncOperations.aggregatedOperations]
            
            // All 3 operations should be tracked (either in operations or aggregatedOperations)
            const totalOps = allOps.length + allAggregated.reduce((sum, agg) => sum + agg.count, 0)
            expect(totalOps).toBe(3)
            
            // Find operations by name in either list
            const normalOp = allOps.find(op => op.name === 'normal-op') || 
                           allAggregated.find(agg => agg.name === 'normal-op')
            expect(normalOp?.severity).toBe('normal')
            
            // Verify we detect slow operations (warning or critical)
            const slowOps = allOps.filter(op => op.name !== 'normal-op')
            const slowAggs = allAggregated.filter(agg => agg.name !== 'normal-op')
            const allSlowOps = [...slowOps, ...slowAggs]
            expect(allSlowOps.length).toBeGreaterThan(0)
            expect(allSlowOps.every(op => op.severity === 'warning' || op.severity === 'critical')).toBe(true)
        })
    })

    describe('Report Generation', () => {
        it('should generate comprehensive report', () => {
            const monitor1 = PerformanceMonitor.start('op1', mockLogger)
            monitor1.end()

            const monitor2 = PerformanceMonitor.start('op2', mockLogger)
            monitor2.end()

            const report = PerformanceMonitor.getReport()

            expect(report.metadata).toBeDefined()
            expect(report.metadata.userAgent).toBeDefined()
            expect(report.metadata.timestamp).toBeDefined()
            // Fast operations go to aggregatedOperations
            const allAggregated = [...report.mainThreadBlocking.aggregatedOperations, ...report.asyncOperations.aggregatedOperations]
            expect(allAggregated.length).toBeGreaterThan(0)
            expect(report.summary.totalOperations).toBe(2)
        })

        it('should track summary statistics', async () => {
            // Normal
            PerformanceMonitor.start('normal', mockLogger, {
                blockingThreshold: 100
            }).end()

            // Slow operations
            const slow1 = PerformanceMonitor.start('slow1', mockLogger, {
                blockingThreshold: 5
            })
            await new Promise(resolve => setTimeout(resolve, 10))
            slow1.end()

            const slow2 = PerformanceMonitor.start('slow2', mockLogger, {
                blockingThreshold: 5
            })
            await new Promise(resolve => setTimeout(resolve, 15))
            slow2.end()

            const report = PerformanceMonitor.getReport()
            expect(report.summary.totalOperations).toBe(3)
            // Should have at least some warning/critical operations
            expect(report.summary.warningOperations + report.summary.criticalOperations).toBeGreaterThan(0)
        })

        it('should identify longest blocking operation', async () => {
            PerformanceMonitor.start('short', mockLogger).end()

            const long = PerformanceMonitor.start('long', mockLogger)
            await new Promise(resolve => setTimeout(resolve, 10))
            long.end()

            PerformanceMonitor.start('medium', mockLogger).end()

            const report = PerformanceMonitor.getReport()
            expect(report.summary.longestBlock?.name).toBe('long')
        })

        it('should track live statistics', () => {
            PerformanceMonitor.start('op1', mockLogger).end()
            
            const stats = PerformanceMonitor.getStats()
            expect(stats.totalOperations).toBe(1)
            expect(stats.isTracking).toBe(true)
        })
    })

    describe('Reset Functionality', () => {
        it('should clear all tracking data', () => {
            PerformanceMonitor.start('op1', mockLogger).end()
            PerformanceMonitor.start('op2', mockLogger).end()

            expect(PerformanceMonitor.getStats().totalOperations).toBe(2)

            PerformanceMonitor.reset()

            expect(PerformanceMonitor.getStats().totalOperations).toBe(0)
        })
    })

    describe('Browser Performance API Integration', () => {
        it('should create performance marks', () => {
            const markSpy = vi.spyOn(performance, 'mark')

            const monitor = PerformanceMonitor.start('test-op', mockLogger)
            monitor.end()

            expect(markSpy).toHaveBeenCalledWith('test-op-start')
            expect(markSpy).toHaveBeenCalledWith('test-op-end')

            markSpy.mockRestore()
        })

        it('should create performance measure', () => {
            const measureSpy = vi.spyOn(performance, 'measure')

            const monitor = PerformanceMonitor.start('test-op', mockLogger)
            monitor.end()

            expect(measureSpy).toHaveBeenCalledWith('test-op', 'test-op-start', 'test-op-end')

            measureSpy.mockRestore()
        })
    })

    describe('Initial Metadata', () => {
        it('should support initial metadata in options', async () => {
            const monitor = PerformanceMonitor.start('op-with-initial', mockLogger, {
                metadata: { initial: 'value' }
            })
            await new Promise(resolve => setTimeout(resolve, 20))
            monitor.end({ final: 'value' })

            const report = PerformanceMonitor.getReport()
            const allOps = [...report.mainThreadBlocking.operations, ...report.asyncOperations.operations]
            expect(allOps.length).toBeGreaterThan(0)
            expect(allOps[0].metadata).toEqual({
                initial: 'value',
                final: 'value'
            })
        })

        it('should merge initial and end metadata', async () => {
            const monitor = PerformanceMonitor.start('merge-test', mockLogger, {
                metadata: { start: 'data', shared: 'initial' }
            })
            await new Promise(resolve => setTimeout(resolve, 20))
            monitor.end({ end: 'data', shared: 'final' })

            const report = PerformanceMonitor.getReport()
            const allOps = [...report.mainThreadBlocking.operations, ...report.asyncOperations.operations]
            expect(allOps.length).toBeGreaterThan(0)
            expect(allOps[0].metadata).toEqual({
                start: 'data',
                end: 'data',
                shared: 'final' // End metadata should override
            })
        })
    })
})
