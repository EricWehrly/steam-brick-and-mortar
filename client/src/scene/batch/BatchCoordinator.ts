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

export interface BatchItem<T> {
    /** Batch sequential index (0-based) */
    batchIndex: number
    /** Total number of batches expected */
    totalBatches: number
    /** Batch payload data */
    data: T
}

export interface BatchProgress {
    /** Number of batches received so far */
    received: number
    /** Total number of batches expected */
    total: number
    /** Whether all batches have been received */
    isComplete: boolean
}

export interface BatchMetrics {
    /** Individual batch timing information */
    batches: Array<{ batchIndex: number; duration: number }>
    /** Total time spent processing batches (main thread) */
    totalMainThreadTime: number
    /** When batch processing started */
    loadStart: number
}

export type BatchProcessor<T> = (batch: BatchItem<T>) => Promise<void>

/**
 * Coordinates batch processing with queue management and progress tracking
 */
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

    private processor: BatchProcessor<T>

    /**
     * @param processor - Async function to process each batch
     */
    constructor(processor: BatchProcessor<T>) {
        this.processor = processor
    }

    /**
     * Enqueue a batch for processing
     * Automatically starts processing if not already running
     */
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

    /**
     * Get current progress information
     */
    public getProgress(): BatchProgress {
        return {
            received: this.received,
            total: this.expectedTotal,
            isComplete: this.received === this.expectedTotal && this.expectedTotal > 0
        }
    }

    /**
     * Get performance metrics
     */
    public getMetrics(): Readonly<BatchMetrics> {
        return { ...this.metrics }
    }

    /**
     * Check if this is the first batch being processed
     */
    public isFirstBatchProcessing(): boolean {
        return this.isFirstBatch
    }

    /**
     * Reset coordinator state for a new batch sequence
     */
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

    /**
     * Process all queued batches in order
     * Handles queue sorting and serialization
     */
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

    /**
     * Process a single batch with timing and metrics
     */
    private async processOneBatch(batch: BatchItem<T>): Promise<void> {
        const { batchIndex, totalBatches } = batch

        // Initialize metrics on first batch
        if (this.isFirstBatch) {
            this.metrics.loadStart = Date.now()
        }

        const batchMonitor = PerformanceMonitor.start('batch-process', BatchCoordinator.logger, {
            metadata: { batchIndex, totalBatches }
        })

        try {
            await this.processor(batch)

            const batchDuration = batchMonitor.getElapsed()
            this.metrics.batches.push({ batchIndex, duration: batchDuration })
            this.metrics.totalMainThreadTime += batchDuration

            batchMonitor.end({
                batch: `${batchIndex + 1}/${totalBatches}`
            })

            BatchCoordinator.logger.debug(`Batch ${batchIndex + 1}/${totalBatches} complete (${batchDuration.toFixed(1)}ms)`)
        } catch (error) {
            const batchDuration = batchMonitor.getElapsed()
            this.metrics.batches.push({ batchIndex, duration: batchDuration })
            this.metrics.totalMainThreadTime += batchDuration
            
            batchMonitor.end({ error: true })
            BatchCoordinator.logger.error(`Batch ${batchIndex + 1}/${totalBatches} failed: ${error}`)
            // Don't rethrow - log and continue processing remaining batches
        } finally {
            // Clear first batch flag after processing completes
            if (this.isFirstBatch) {
                this.isFirstBatch = false
            }
        }
    }

    /**
     * Log summary when all batches are complete
     */
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
