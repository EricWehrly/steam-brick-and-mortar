/**
 * Batch Coordinator
 * 
 * Manages queued batch processing with serialization guarantees.
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
import { DataManager } from '../../core/data/DataManager'
import { 
    BatchProcessingStatus,
    GameEventTypes,
    SteamEventTypes, 
    StorePropsEventTypes,
    AppEventTypes,
    type SteamGamesBatchEvent,
    type BatchReadyForPlacementEvent,
    type GamesPlacedEvent,
} from '../../types/InteractionEvents'
import type { AllBatchesCompleteEvent, GameDataReadyEvent, SomeBatchesCompleteEvent } from '../../types/EnvironmentEvents'

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

interface BatchStatusState {
    status: BatchProcessingStatus
    lastModified: number
}

export class BatchCoordinator<T> {
    private static readonly logger = Logger.createLogFunctions(BatchCoordinator.name)

    private queue: BatchItem<T>[] = []
    private received: number = 0
    private expectedTotal: number = 0
    private isProcessing: boolean = false
    private isScheduled: boolean = false
    private isFirstBatch: boolean = true
    private completionEmitted: boolean = false
    private batchStatuses: Map<number, BatchStatusState> = new Map()
    private pendingSomeBatchesTimeout: ReturnType<typeof setTimeout> | null = null
    private readonly someBatchesDebounceMs: number = 50
    private gameDataReadyEmittedForRun: boolean = false

    private metrics: BatchMetrics = {
        batches: [],
        totalMainThreadTime: 0,
        loadStart: 0
    }

    private readonly boundHandleBatchEvent: (e: CustomEvent<SteamGamesBatchEvent>) => void
    private readonly boundHandleGamesPlaced: (e: CustomEvent<GamesPlacedEvent>) => void
    private readonly boundHandleClearRequest: () => void

    static {
        new BatchCoordinator()
    }

    private constructor() {
        this.boundHandleBatchEvent = this.handleBatchEvent.bind(this)
        this.boundHandleGamesPlaced = this.handleGamesPlaced.bind(this)
        this.boundHandleClearRequest = this.clearRunState.bind(this)

        EventManager.getInstance().registerEventHandler(
            SteamEventTypes.GamesBatchReady,
            this.boundHandleBatchEvent
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.GamesPlaced,
            this.boundHandleGamesPlaced
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LayoutClearRequest,
            this.boundHandleClearRequest
        )
        EventManager.getInstance().registerEventHandler(
            StorePropsEventTypes.LibraryReloadRequest,
            this.boundHandleClearRequest
        )
        BatchCoordinator.logger.debug('Constructed')
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

    private handleGamesPlaced(event: CustomEvent<GamesPlacedEvent>): void {
        this.batchStatuses.set(event.detail.batchIndex, {
            status: event.detail.status ?? BatchProcessingStatus.GamesPlaced,
            lastModified: Date.now()
        })
        this.scheduleSomeBatchesCompleteEvent()
        this.tryEmitCompletionEvent()
    }

    public enqueueBatch(batch: BatchItem<T>): void {
        this.prepareForNewRun(batch)
        BatchCoordinator.logger.debug(`Enqueuing batch ${batch.batchIndex + 1}/${batch.totalBatches}`)

        this.queue.push(batch)
        this.received++
        this.expectedTotal = batch.totalBatches
        this.batchStatuses.set(batch.batchIndex, {
            status: BatchProcessingStatus.Queued,
            lastModified: Date.now()
        })

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

    private prepareForNewRun(batch: BatchItem<T>): void {
        if (!this.completionEmitted) {
            return
        }

        const startsAtFirstBatch = batch.batchIndex === 0
        const totalChanged = this.expectedTotal > 0 && batch.totalBatches !== this.expectedTotal
        if (!startsAtFirstBatch && !totalChanged) {
            return
        }

        BatchCoordinator.logger.debug('Detected new batch run boundary — clearing previous run state')
        this.clearRunState()
    }

    private clearRunState(): void {
        this.queue = []
        this.received = 0
        this.expectedTotal = 0
        this.isProcessing = false
        this.isScheduled = false
        this.isFirstBatch = true
        this.completionEmitted = false
        this.batchStatuses.clear()
        if (this.pendingSomeBatchesTimeout) {
            clearTimeout(this.pendingSomeBatchesTimeout)
            this.pendingSomeBatchesTimeout = null
        }
        this.metrics = {
            batches: [],
            totalMainThreadTime: 0,
            loadStart: 0
        }
        this.gameDataReadyEmittedForRun = false
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing) {
            BatchCoordinator.logger.debug('Already processing, skipping duplicate call')
            return
        }

        this.isProcessing = true
        this.emitGameDataReadyIfNeeded()

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

        this.tryEmitCompletionEvent()
    }

    private emitGameDataReadyIfNeeded(): void {
        if (this.gameDataReadyEmittedForRun || this.expectedTotal <= 0) {
            return
        }

        const totalGamesFromLibrary = DataManager.getInstance().get<unknown[]>('steam.games')?.length ?? 0
        const totalGames = totalGamesFromLibrary > 0
            ? totalGamesFromLibrary
            : this.expectedTotal * 18

        if (totalGamesFromLibrary === 0) {
            BatchCoordinator.logger.warn(
                `GameDataReady emitted without steam.games populated; using estimated totalGames=${totalGames}`
            )
        }

        EventManager.getInstance().emit<GameDataReadyEvent>(
            GameEventTypes.GameDataReady,
            { totalGames, totalBatches: this.expectedTotal }
        )
        this.gameDataReadyEmittedForRun = true
        BatchCoordinator.logger.debug(`GameDataReady emitted before batch dispatch (${this.expectedTotal} batches expected)`)
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
                totalBatches,
            }
        )
        // TODO: Revisit whether this should be paired with a globally debounced
        // "batches ready" signal so consumers don't each implement their own debounce.
        this.batchStatuses.set(batchIndex, {
            status: BatchProcessingStatus.Dispatched,
            lastModified: Date.now()
        })
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

    private tryEmitCompletionEvent(): void {
        if (this.completionEmitted) {
            return
        }

        const progress = this.getProgress()
        const terminalBatchCount = this.getTerminalBatchCount()
        const allPlaced = this.expectedTotal > 0 && terminalBatchCount >= this.expectedTotal
        if (!progress.isComplete || !allPlaced) {
            return
        }

        this.completionEmitted = true

        if (this.pendingSomeBatchesTimeout) {
            clearTimeout(this.pendingSomeBatchesTimeout)
            this.pendingSomeBatchesTimeout = null
        }
        this.emitSomeBatchesCompleteEvent()

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

        EventManager.getInstance().emit<AllBatchesCompleteEvent>(
            GameEventTypes.AllBatchesComplete,
            {}
        )
        EventManager.getInstance().emit(AppEventTypes.StoreFullyPopulated, {})
    }

    private scheduleSomeBatchesCompleteEvent(): void {
        if (this.pendingSomeBatchesTimeout) {
            clearTimeout(this.pendingSomeBatchesTimeout)
        }

        this.pendingSomeBatchesTimeout = setTimeout(() => {
            this.pendingSomeBatchesTimeout = null
            this.emitSomeBatchesCompleteEvent()
        }, this.someBatchesDebounceMs)
    }

    private emitSomeBatchesCompleteEvent(): void {
        const totalBatches = this.expectedTotal
        if (totalBatches <= 0) {
            return
        }

        EventManager.getInstance().emit<SomeBatchesCompleteEvent>(
            GameEventTypes.SomeBatchesComplete,
            {
                completedBatches: this.getTerminalBatchCount(),
                totalBatches
            }
        )
    }

    private getTerminalBatchCount(): number {
        return [...this.batchStatuses.values()].filter(({ status }) =>
            status === BatchProcessingStatus.GamesPlaced ||
            status === BatchProcessingStatus.Dispatched ||
            status === BatchProcessingStatus.Failed
        ).length
    }
}

// Construct at import � registers event handlers for app lifetime.

