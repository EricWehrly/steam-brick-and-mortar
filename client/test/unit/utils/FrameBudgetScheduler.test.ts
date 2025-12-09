import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the Logger to prevent console output during tests
vi.mock('../../../src/utils/Logger', () => ({
    Logger: {
        withContext: () => ({
            lifecycle: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn()
        })
    }
}))

import { FrameBudgetScheduler } from '../../../src/utils/FrameBudgetScheduler'

describe('FrameBudgetScheduler', () => {
    let scheduler: FrameBudgetScheduler
    let mockNow: number

    beforeEach(() => {
        // Reset singleton and create fresh instance
        ;(FrameBudgetScheduler as any).instance = null
        
        // Mock performance.now to control time
        mockNow = 1000
        vi.spyOn(globalThis.performance, 'now').mockImplementation(() => mockNow)
        
        scheduler = FrameBudgetScheduler.getInstance({ targetFps: 60 })
    })

    afterEach(() => {
        scheduler.dispose()
        vi.mocked(globalThis.performance.now).mockRestore()
    })

    describe('initialization', () => {
        it('should create a singleton instance', () => {
            const instance1 = FrameBudgetScheduler.getInstance()
            const instance2 = FrameBudgetScheduler.getInstance()
            expect(instance1).toBe(instance2)
        })

        it('should initialize with default target FPS of 60', () => {
            const stats = scheduler.getStats()
            expect(stats.targetFps).toBe(60)
        })

        it('should allow custom target FPS', () => {
            scheduler.dispose()
            const custom = FrameBudgetScheduler.getInstance({ targetFps: 90 })
            expect(custom.getStats().targetFps).toBe(90)
        })
    })

    describe('frame time tracking', () => {
        it('should track rolling average frame time', () => {
            // Simulate some frames
            let time = 0
            for (let i = 0; i < 10; i++) {
                time += 16.67  // 60fps
                scheduler.onFrameStart(time)
            }

            const avgFrameTime = scheduler.getRollingAvgFrameTime()
            expect(avgFrameTime).toBeCloseTo(16.67, 1)
        })

        it('should calculate current FPS from frame times', () => {
            let time = 0
            for (let i = 0; i < 10; i++) {
                time += 16.67
                scheduler.onFrameStart(time)
            }

            const fps = scheduler.getCurrentFps()
            expect(fps).toBeCloseTo(60, 0)
        })
    })

    describe('budget calculation', () => {
        it('should have budget at frame start', () => {
            scheduler.onFrameStart(1000)
            // At frame start, we should have nearly full budget
            expect(scheduler.hasBudget(1)).toBe(true)
        })

        it('should report remaining budget', () => {
            scheduler.onFrameStart(1000)
            const budget = scheduler.getRemainingBudget()
            // Should be close to target frame time * threshold (16.67 * 0.8 ≈ 13.3ms)
            expect(budget).toBeGreaterThan(10)
        })
    })

    describe('task scheduling', () => {
        it('should schedule a task', () => {
            let executed = false
            scheduler.schedule(() => { executed = true })
            
            expect(scheduler.getStats().pendingTasks).toBe(1)
            expect(executed).toBe(false)
        })

        it('should execute pending tasks on frame start', () => {
            let executed = false
            scheduler.schedule(() => { executed = true })
            
            scheduler.onFrameStart(1000)
            
            expect(executed).toBe(true)
            expect(scheduler.getStats().pendingTasks).toBe(0)
        })

        it('should execute immediately if budget available via tryExecuteOrSchedule', () => {
            scheduler.onFrameStart(1000)
            
            let executed = false
            const wasImmediate = scheduler.tryExecuteOrSchedule(() => { executed = true })
            
            expect(wasImmediate).toBe(true)
            expect(executed).toBe(true)
        })

        it('should track tasks executed per frame', () => {
            scheduler.schedule(() => {})
            scheduler.schedule(() => {})
            scheduler.schedule(() => {})
            
            scheduler.onFrameStart(1000)
            
            expect(scheduler.getStats().tasksExecutedLastFrame).toBe(3)
        })
    })

    describe('task priority', () => {
        it('should execute high priority tasks before normal', () => {
            const order: string[] = []
            
            scheduler.schedule(() => order.push('normal1'), { priority: 'normal' })
            scheduler.schedule(() => order.push('high'), { priority: 'high' })
            scheduler.schedule(() => order.push('normal2'), { priority: 'normal' })
            
            scheduler.onFrameStart(1000)
            
            expect(order[0]).toBe('high')
        })

        it('should execute normal priority tasks before low', () => {
            const order: string[] = []
            
            scheduler.schedule(() => order.push('low'), { priority: 'low' })
            scheduler.schedule(() => order.push('normal'), { priority: 'normal' })
            
            scheduler.onFrameStart(1000)
            
            expect(order[0]).toBe('normal')
            expect(order[1]).toBe('low')
        })
    })

    describe('async scheduling', () => {
        it('should return a promise that resolves when task executes', async () => {
            const result = scheduler.scheduleAsync(() => 42)
            
            scheduler.onFrameStart(1000)
            
            await expect(result).resolves.toBe(42)
        })
    })

    describe('statistics', () => {
        it('should track total tasks deferred', () => {
            scheduler.schedule(() => {})
            scheduler.schedule(() => {})
            
            const stats = scheduler.getStats()
            expect(stats.totalTasksDeferred).toBe(2)
        })

        it('should reset stats', () => {
            scheduler.schedule(() => {})
            scheduler.onFrameStart(1000)
            
            scheduler.resetStats()
            
            const stats = scheduler.getStats()
            expect(stats.totalTasksDeferred).toBe(0)
            expect(stats.tasksExecutedLastFrame).toBe(0)
        })
    })

    describe('configuration', () => {
        it('should allow changing target FPS', () => {
            scheduler.setTargetFps(90)
            expect(scheduler.getStats().targetFps).toBe(90)
        })

        it('should allow changing budget threshold', () => {
            scheduler.setBudgetThreshold(0.5)
            expect(scheduler.getStats().budgetThreshold).toBe(0.5)
        })

        it('should clamp budget threshold to valid range', () => {
            scheduler.setBudgetThreshold(2.0)
            expect(scheduler.getStats().budgetThreshold).toBe(1.0)
            
            scheduler.setBudgetThreshold(-0.5)
            expect(scheduler.getStats().budgetThreshold).toBe(0.1)
        })
    })

    describe('cleanup', () => {
        it('should clear pending tasks', () => {
            scheduler.schedule(() => {})
            scheduler.schedule(() => {})
            
            scheduler.clearPendingTasks()
            
            expect(scheduler.getStats().pendingTasks).toBe(0)
        })

        it('should reset singleton on dispose', () => {
            const first = FrameBudgetScheduler.getInstance()
            first.dispose()
            
            const second = FrameBudgetScheduler.getInstance()
            expect(first).not.toBe(second)
        })
    })
})
