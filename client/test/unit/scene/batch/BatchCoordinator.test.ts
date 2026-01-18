/**
 * Batch Coordinator Tests
 * 
 * Tests batch queue management, serialization, progress tracking, and metrics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BatchCoordinator, type BatchItem, type BatchProgress } from '../../../../src/scene/batch/BatchCoordinator'

describe('BatchCoordinator', () => {
    describe('Basic Queue Management', () => {
        it('should enqueue and process batches in order', async () => {
            const processedBatches: number[] = []
            const coordinator = new BatchCoordinator<string>(async (batch) => {
                processedBatches.push(batch.batchIndex)
                await new Promise(resolve => setTimeout(resolve, 10))
            })

            // Enqueue batches quickly (synchronously) before processing starts
            // This simulates receiving multiple batches in rapid succession
            const batch2 = { batchIndex: 2, totalBatches: 3, data: 'batch-2' }
            const batch0 = { batchIndex: 0, totalBatches: 3, data: 'batch-0' }
            const batch1 = { batchIndex: 1, totalBatches: 3, data: 'batch-1' }
            
            // Enqueue all synchronously before any processing
            coordinator.enqueueBatch(batch2)
            coordinator.enqueueBatch(batch0)
            coordinator.enqueueBatch(batch1)

            // Wait for processing (queue sorts before processing each)
            await new Promise(resolve => setTimeout(resolve, 150))

            expect(processedBatches).toEqual([0, 1, 2])
        })

        it('should track progress correctly', async () => {
            const coordinator = new BatchCoordinator<number>(async () => {
                await new Promise(resolve => setTimeout(resolve, 5))
            })

            expect(coordinator.getProgress()).toEqual({
                received: 0,
                total: 0,
                isComplete: false
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 1 })
            expect(coordinator.getProgress().received).toBe(1)
            expect(coordinator.getProgress().total).toBe(3)
            expect(coordinator.getProgress().isComplete).toBe(false)

            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 2 })
            coordinator.enqueueBatch({ batchIndex: 2, totalBatches: 3, data: 3 })

            await new Promise(resolve => setTimeout(resolve, 50))

            expect(coordinator.getProgress()).toEqual({
                received: 3,
                total: 3,
                isComplete: true
            })
        })

        it('should reset state correctly', async () => {
            const coordinator = new BatchCoordinator<string>(async () => {
                await new Promise(resolve => setTimeout(resolve, 5))
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'test' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'test' })

            await new Promise(resolve => setTimeout(resolve, 30))

            coordinator.reset()

            expect(coordinator.getProgress()).toEqual({
                received: 0,
                total: 0,
                isComplete: false
            })

            const metrics = coordinator.getMetrics()
            expect(metrics.batches).toEqual([])
            expect(metrics.totalMainThreadTime).toBe(0)
        })
    })

    describe('Batch Processing', () => {
        it('should process batches serially', async () => {
            let currentlyProcessing = 0
            let maxConcurrent = 0

            const coordinator = new BatchCoordinator<string>(async () => {
                currentlyProcessing++
                maxConcurrent = Math.max(maxConcurrent, currentlyProcessing)
                await new Promise(resolve => setTimeout(resolve, 20))
                currentlyProcessing--
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 'b' })
            coordinator.enqueueBatch({ batchIndex: 2, totalBatches: 3, data: 'c' })

            await new Promise(resolve => setTimeout(resolve, 100))

            expect(maxConcurrent).toBe(1) // Never more than 1 at a time
        })

        it('should pass correct batch data to processor', async () => {
            const processedData: string[] = []

            const coordinator = new BatchCoordinator<string>(async (batch) => {
                processedData.push(batch.data)
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'first' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'second' })

            await new Promise(resolve => setTimeout(resolve, 30))

            expect(processedData).toEqual(['first', 'second'])
        })

        it('should handle errors in batch processing', async () => {
            const coordinator = new BatchCoordinator<string>(async (batch) => {
                if (batch.batchIndex === 1) {
                    throw new Error('Test error')
                }
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 'b' })

            // Should not throw, error is logged
            await new Promise(resolve => setTimeout(resolve, 30))

            // Progress still tracked despite error
            expect(coordinator.getProgress().received).toBe(2)
        })
    })

    describe('Metrics Tracking', () => {
        it('should track batch processing times', async () => {
            const coordinator = new BatchCoordinator<number>(async (batch) => {
                await new Promise(resolve => setTimeout(resolve, batch.data))
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 10 })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 20 })

            await new Promise(resolve => setTimeout(resolve, 100))

            const metrics = coordinator.getMetrics()
            expect(metrics.batches).toHaveLength(2)
            expect(metrics.batches[0].batchIndex).toBe(0)
            expect(metrics.batches[1].batchIndex).toBe(1)
            expect(metrics.totalMainThreadTime).toBeGreaterThan(0)
            expect(metrics.loadStart).toBeGreaterThan(0)
        })

        it('should identify first batch correctly', async () => {
            let wasFirstBatch = false

            const coordinator = new BatchCoordinator<string>(async () => {
                wasFirstBatch = coordinator.isFirstBatchProcessing()
            })

            expect(coordinator.isFirstBatchProcessing()).toBe(true)

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 1, data: 'test' })

            await new Promise(resolve => setTimeout(resolve, 20))

            expect(wasFirstBatch).toBe(true)
            expect(coordinator.isFirstBatchProcessing()).toBe(false)
        })
    })

    describe('Edge Cases', () => {
        it('should handle single batch', async () => {
            let processed = false

            const coordinator = new BatchCoordinator<string>(async () => {
                processed = true
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 1, data: 'only' })

            await new Promise(resolve => setTimeout(resolve, 20))

            expect(processed).toBe(true)
            expect(coordinator.getProgress().isComplete).toBe(true)
        })

        it('should handle empty queue', async () => {
            const coordinator = new BatchCoordinator<string>(async () => {})

            const progress = coordinator.getProgress()
            expect(progress.received).toBe(0)
            expect(progress.isComplete).toBe(false)
        })

        it('should handle rapid enqueueing', async () => {
            const processedBatches: number[] = []

            const coordinator = new BatchCoordinator<number>(async (batch) => {
                processedBatches.push(batch.batchIndex)
                await new Promise(resolve => setTimeout(resolve, 5))
            })

            // Enqueue many batches rapidly
            for (let i = 0; i < 10; i++) {
                coordinator.enqueueBatch({ batchIndex: i, totalBatches: 10, data: i })
            }

            // 10 batches * 5ms each + event loop yields = ~100ms minimum
            await new Promise(resolve => setTimeout(resolve, 300))

            expect(processedBatches).toHaveLength(10)
            expect(processedBatches).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        })

        it('should handle duplicate enqueuing gracefully', async () => {
            const processedBatches: number[] = []

            const coordinator = new BatchCoordinator<string>(async (batch) => {
                processedBatches.push(batch.batchIndex)
            })

            // Enqueue same batch index multiple times (should process both)
            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'first' })
            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'duplicate' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'second' })

            await new Promise(resolve => setTimeout(resolve, 50))

            // Should process all enqueued items
            expect(processedBatches).toEqual([0, 0, 1])
            expect(coordinator.getProgress().received).toBe(3)
        })
    })

    describe('Async Behavior', () => {
        it('should yield to event loop between batches', async () => {
            const timestamps: number[] = []

            const coordinator = new BatchCoordinator<string>(async () => {
                timestamps.push(Date.now())
                // Synchronous work - should still yield after
            })

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 'b' })
            coordinator.enqueueBatch({ batchIndex: 2, totalBatches: 3, data: 'c' })

            await new Promise(resolve => setTimeout(resolve, 50))

            // Should have processed all 3
            expect(timestamps).toHaveLength(3)
        })

        it('should not start processing again if already processing', async () => {
            let startCount = 0

            const coordinator = new BatchCoordinator<string>(async () => {
                await new Promise(resolve => setTimeout(resolve, 50))
            })

            // Override private method to track starts (testing internal behavior)
            const originalProcessQueue = (coordinator as any).processQueue.bind(coordinator)
            ;(coordinator as any).processQueue = async function() {
                startCount++
                return originalProcessQueue()
            }

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'b' })

            await new Promise(resolve => setTimeout(resolve, 100))

            // Should only start queue processing once despite two enqueues
            expect(startCount).toBe(1)
        })
    })
})
