/**
 * Batch Coordinator
 * 
 * Manages queued batch processing with serialization guarantees.
 * Extracts batch queue management logic from GpuStorePropsRenderer.
 * 
 * Features:
 * - Automatic queue sorting by batch index
 * - Serialized processing (one batch at a time)
 * - Progress tracking and metrics
 * - Event loop yielding between batches
 * - Comprehensive logging
 */

import { Logger } from '../../utils/Logger'
import { PerformanceMonitor } from '../../utils/PerformanceMonitor'
import { EventManager } from '../../core/EventManager'
import { 
    SteamEventTypes, 
    StorePropsEventTypes,
    type SteamGamesBatchEvent,
    type BatchReadyForPlacementEvent 
} from '../../types/InteractionEvents'

export interface BatchItem<T> {
    batchIndex: number
    totalBatches: number
    data: T
}

export interface BatchProgress {
    received: number
    total: number
    isComplete: boolean
}

export interface BatchMetrics {
    batches: Array<{ batchIndex: number; duration: number }>
    totalMainThreadTime: number
    loadStart: number
}

export class BatchCoordinator<T> {
    private static logger = Logger.createLogFunctions(BatchCoordinator.name)

    private queue: BatchItem<T>[] = []
    private received: number = 0
    private expectedTotal: number = 0
    private isProcessing: boolean = false
    private isScheduled: boolean = false  // Track if processQueue is scheduled
    private isFirstBatch: boolean = true
    
    private metrics: BatchMetrics = {
        batches: [],
        totalMainThreadTime: 0,
        loadStart: 0
    }

    constructor() {
        
        // Self-register for GamesBatchReady events
        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.GamesBatchReady,
            this.handleBatchEvent.bind(this)
        )
        BatchCoordinator.logger.debug('Self-registered for GamesBatchReady events')
    }
    
    /**
     * Handle incoming batch events
     * Extracts batch data and enqueues for processing
     */
    private handleBatchEvent(event: CustomEvent<SteamGamesBatchEvent>): void {
        const { batchIndex, totalBatches } = event.detail
        this.enqueueBatch({
            batchIndex,
            totalBatches,
            data: event.detail as unknown as T
        })
    }

    public enqueueBatch(batch: BatchItem<T>): void {
        BatchCoordinator.logger.debug(`Enqueuing batch ${batch.batchIndex + 1}/${batch.totalBatches}`)
        
        this.queue.push(batch)
        this.received++
        this.expectedTotal = batch.totalBatches

        // Sort queue immediately to maintain order
        this.queue.sort((a, b) => a.batchIndex - b.batchIndex)

        if (!this.isProcessing && !this.isScheduled) {
            // Defer start slightly to allow synchronous batch enqueues to complete
            this.isScheduled = true
            setTimeout(() => {
                this.isScheduled = false
                this.processQueue()
            }, 0)
        }
    }

    public getProgress(): BatchProgress {
        return {
            received: this.received,
            total: this.expectedTotal,
            isComplete: this.received === this.expectedTotal && this.expectedTotal > 0
        }
    }

    public getMetrics(): Readonly<BatchMetrics> {
        return { ...this.metrics }
    }

    public isFirstBatchProcessing(): boolean {
        return this.isFirstBatch
    }

    public reset(): void {
        BatchCoordinator.logger.debug('Resetting batch coordinator')
        
        this.queue = []
        this.received = 0
        this.expectedTotal = 0
        this.isProcessing = false
        this.isScheduled = false
        this.isFirstBatch = true
        this.metrics = {
            batches: [],
            totalMainThreadTime: 0,
            loadStart: 0
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            BatchCoordinator.logger.debug('Already processing, skipping duplicate call')
            return
        }

        this.isProcessing = true
        
        BatchCoordinator.logger.debug('Starting batch processing queue')

        try {
            while (this.queue.length > 0) {
                // Sort queue by batch index to ensure correct order (for late arrivals)
                this.queue.sort((a, b) => a.batchIndex - b.batchIndex)
                
                const batch = this.queue.shift()
                if (!batch) break

                await this.processOneBatch(batch)

                // Yield to event loop between batches to prevent blocking
                await new Promise(resolve => setTimeout(resolve, 0))
            }
        } finally {
            this.isProcessing = false
        }

        // Log completion if all batches received
        if (this.getProgress().isComplete) {
            this.logCompletionSummary()
        }
    }

    private async processOneBatch(batch: BatchItem<T>): Promise<void> {
        const { batchIndex, totalBatches } = batch

        // Initialize metrics on first batch
        if (this.isFirstBatch) {
            this.metrics.loadStart = Date.now()
        }

        const batchMonitor = PerformanceMonitor.start('batch-process', BatchCoordinator.logger, {
            metadata: { batchIndex, totalBatches }
        })

        // Emit BatchReadyForPlacement event for downstream processing
        const batchData = batch.data as unknown as SteamGamesBatchEvent
        EventManager.getInstance().emit<BatchReadyForPlacementEvent>(
            StorePropsEventTypes.BatchReadyForPlacement,
            {
                games: batchData.games,
                batchIndex,
                totalBatches
            }
        )
        BatchCoordinator.logger.debug(`Emitted BatchReadyForPlacement for batch ${batchIndex + 1}/${totalBatches}`)
        
        const batchDuration = batchMonitor.getElapsed()
        this.metrics.batches.push({ batchIndex, duration: batchDuration })
        this.metrics.totalMainThreadTime += batchDuration

        batchMonitor.end({
            batch: `${batchIndex + 1}/${totalBatches}`
        })
        
        // Clear first batch flag after processing completes
        if (this.isFirstBatch) {
            this.isFirstBatch = false
        }
    }

    private logCompletionSummary(): void {
        const totalLoadTime = Date.now() - this.metrics.loadStart
        const avgMainThreadTime = this.metrics.totalMainThreadTime / this.metrics.batches.length
        const asyncTime = totalLoadTime - this.metrics.totalMainThreadTime

        BatchCoordinator.logger.info(
            `📊 [BATCH SUMMARY] ${this.metrics.batches.length} batches | ` +
            `Main: ${this.metrics.totalMainThreadTime.toFixed(1)}ms | ` +
            `Async: ${asyncTime.toFixed(1)}ms | ` +
            `Total: ${totalLoadTime.toFixed(1)}ms | ` +
            `Avg/batch: ${avgMainThreadTime.toFixed(1)}ms`
        )
    }
}
