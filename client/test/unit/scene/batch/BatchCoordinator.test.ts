/**
 * Batch Coordinator Tests
 * 
 * Tests batch queue management, serialization, progress tracking, and metrics.
 * Phase 3f: Updated for pure event-driven architecture (no processor callback)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { BatchCoordinator, type BatchItem, type BatchProgress } from '../../../../src/scene/batch/BatchCoordinator'

import { EventManager } from '../../../../src/core/EventManager'
import { BatchProcessingStatus, GameEventTypes, StorePropsEventTypes, UIEventTypes, type BatchReadyForPlacementEvent, type GamesPlacedEvent } from '../../../../src/types/InteractionEvents'

describe('BatchCoordinator', () => {
    let eventManager: EventManager
    
    beforeEach(() => {
        
        eventManager = EventManager.getInstance()
        eventManager.removeAllListeners()
    })

    afterEach(() => {
        
        eventManager.removeAllListeners()
    })


    describe('Basic Queue Management', () => {
        it('should enqueue and emit batches in order', async () => {
            const emittedBatches: number[] = []
            
            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                    emittedBatches.push(event.detail.batchIndex)
                }
            )
            
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            // Enqueue batches out of order
            const batch2 = { batchIndex: 2, totalBatches: 3, data: 'batch-2' }
            const batch0 = { batchIndex: 0, totalBatches: 3, data: 'batch-0' }
            const batch1 = { batchIndex: 1, totalBatches: 3, data: 'batch-1' }
            
            coordinator.enqueueBatch(batch2)
            coordinator.enqueueBatch(batch0)
            coordinator.enqueueBatch(batch1)

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 100))

            expect(emittedBatches).toEqual([0, 1, 2])
        })

        it('should track progress correctly', async () => {
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<number>)()

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
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'test' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'test' })

            await new Promise(resolve => setTimeout(resolve, 30))

            eventManager.emit(UIEventTypes.ArrangementRequested, { groupMode: 'by-recency', sortMode: 'by-last-played' } as any)

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

    describe('Event Emission', () => {
        it('should emit BatchReadyForPlacement events', async () => {
            const emittedEvents: BatchReadyForPlacementEvent[] = []
            
            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                    emittedEvents.push(event.detail)
                }
            )
            
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'first' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'second' })

            await new Promise(resolve => setTimeout(resolve, 50))

            expect(emittedEvents).toHaveLength(2)
            expect(emittedEvents[0].batchIndex).toBe(0)
            expect(emittedEvents[0].totalBatches).toBe(2)
            expect(emittedEvents[1].batchIndex).toBe(1)
        })

        it('should emit events in batch order', async () => {
            const emittedBatches: number[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                    emittedBatches.push(event.detail.batchIndex)
                }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 'b' })
            coordinator.enqueueBatch({ batchIndex: 2, totalBatches: 3, data: 'c' })

            await new Promise(resolve => setTimeout(resolve, 100))

            expect(emittedBatches).toEqual([0, 1, 2])
        })
    })

    describe('Metrics Tracking', () => {
        it('should track batch processing', async () => {
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<number>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 10 })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 20 })

            await new Promise(resolve => setTimeout(resolve, 100))

            const metrics = coordinator.getMetrics()
            expect(metrics.batches).toHaveLength(2)
            expect(metrics.batches[0].batchIndex).toBe(0)
            expect(metrics.batches[1].batchIndex).toBe(1)
            // Phase 3f: Pure event-driven means no processor work, metrics track event emission only
            expect(metrics.loadStart).toBeGreaterThan(0)
        })

        it('should identify first batch correctly', async () => {
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            expect(coordinator.isFirstBatchProcessing()).toBe(true)

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 1, data: 'test' })

            await new Promise(resolve => setTimeout(resolve, 20))

            expect(coordinator.isFirstBatchProcessing()).toBe(false)
        })
    })

    describe('Edge Cases', () => {
        it('should handle single batch', async () => {
            let emitted = false

            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                () => { emitted = true }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 1, data: 'only' })

            await new Promise(resolve => setTimeout(resolve, 20))

            expect(emitted).toBe(true)
            expect(coordinator.getProgress().isComplete).toBe(true)
        })

        it('should handle empty queue', async () => {
            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            const progress = coordinator.getProgress()
            expect(progress.received).toBe(0)
            expect(progress.isComplete).toBe(false)
        })

        it('should handle rapid enqueueing', async () => {
            const emittedBatches: number[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                    emittedBatches.push(event.detail.batchIndex)
                }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<number>)()

            // Enqueue many batches rapidly
            for (let i = 0; i < 10; i++) {
                coordinator.enqueueBatch({ batchIndex: i, totalBatches: 10, data: i })
            }

            await new Promise(resolve => setTimeout(resolve, 200))

            expect(emittedBatches).toHaveLength(10)
            expect(emittedBatches).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        })

        it('should handle duplicate enqueuing gracefully', async () => {
            const emittedBatches: number[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                (event: CustomEvent<BatchReadyForPlacementEvent>) => {
                    emittedBatches.push(event.detail.batchIndex)
                }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            // Enqueue same batch index multiple times (should emit all)
            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'first' })
            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'duplicate' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'second' })

            const waitStart = Date.now()
            while (emittedBatches.length < 3 && Date.now() - waitStart < 500) {
                await new Promise(resolve => setTimeout(resolve, 10))
            }

            // Should emit for all enqueued items
            expect(emittedBatches).toEqual([0, 0, 1])
            expect(coordinator.getProgress().received).toBe(3)
        })
    })

    describe('Async Behavior', () => {
        it('should yield to event loop between batches', async () => {
            const timestamps: number[] = []

            eventManager.registerEventHandler(
                StorePropsEventTypes.BatchReadyForPlacement,
                () => {
                    timestamps.push(Date.now())
                }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 3, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 3, data: 'b' })
            coordinator.enqueueBatch({ batchIndex: 2, totalBatches: 3, data: 'c' })

            const waitStart = Date.now()
            while (timestamps.length < 3 && Date.now() - waitStart < 500) {
                await new Promise(resolve => setTimeout(resolve, 10))
            }

            // At least one emission per enqueued batch is expected.
            expect(timestamps.length).toBeGreaterThanOrEqual(3)
        })
    })

    describe('Completion Signaling', () => {
        it('should emit AllBatchesComplete after batches are dispatched (without waiting for GamesPlaced)', async () => {
            let completionCount = 0

            eventManager.registerEventHandler(
                GameEventTypes.AllBatchesComplete,
                () => { completionCount++ }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()

            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 2, data: 'a' })
            coordinator.enqueueBatch({ batchIndex: 1, totalBatches: 2, data: 'b' })

            // Batches are dispatched asynchronously via setTimeout(0)
            expect(completionCount).toBe(0)

            await new Promise(resolve => setTimeout(resolve, 50))
            // Both batches dispatched — completion should have fired without explicit GamesPlaced events.
            expect(completionCount).toBeGreaterThan(0)
        })

        it('should not emit completion more than once for duplicate GamesPlaced', async () => {
            let completionCount = 0

            eventManager.registerEventHandler(
                GameEventTypes.AllBatchesComplete,
                () => { completionCount++ }
            )

            const coordinator = new (BatchCoordinator as unknown as new () => BatchCoordinator<string>)()
            coordinator.enqueueBatch({ batchIndex: 0, totalBatches: 1, data: 'only' })

            await new Promise(resolve => setTimeout(resolve, 30))

            eventManager.emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                { batchIndex: 0, status: BatchProcessingStatus.GamesPlaced }
            )
            eventManager.emit<GamesPlacedEvent>(
                StorePropsEventTypes.GamesPlaced,
                { batchIndex: 0, status: BatchProcessingStatus.GamesPlaced }
            )

            await new Promise(resolve => setTimeout(resolve, 0))
            expect(completionCount).toBe(1)
        })
    })
})
