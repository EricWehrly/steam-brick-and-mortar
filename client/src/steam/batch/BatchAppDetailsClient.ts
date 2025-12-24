/**
 * Batch client for fetching Steam app details from Lambda cache
 * 
 * Provides efficient batch fetching of game metadata (categories, genres, etc.)
 * from the Lambda-cached Steam Store API data.
 */

import type { SteamGameMetadata } from '../types/SteamMetadata'
import { EventManager } from '../../core/EventManager'
import { SteamEventTypes } from '../../types/InteractionEvents'

export interface AppDetailsData extends SteamGameMetadata {
    name: string;
    type: string;
    is_free: boolean;
    artwork: {
        header: string | null;
        capsule: string | null;
        capsule_v5: string | null;
        background: string | null;
        background_raw: string | null;
    };
    // Additional fields from Steam Store API
    full_data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface BatchAppDetailsOptions {
    /**
     * Batch size for requests (recommended 50-100 for optimal performance)
     * Lambda checks cache first (instant), then rate-limits uncached Steam API calls (10 at a time)
     * Larger batches = fewer round trips, better for cache-heavy scenarios
     * First-time hydration: use 50 (mostly uncached). Subsequent: use 100+ (mostly cached)
     */
    batchSize?: number;

    /**
     * Callback for batch progress
     */
    onProgress?: (fetched: number, total: number) => void;

    /**
     * Callback for individual game data received
     */
    onGameData?: (appid: number, data: AppDetailsData) => void;
}

export interface AppDetailsResponse {
    success: boolean;
    appid: number;
    data: AppDetailsData;
    retrieved_at: string;
}

export interface BatchAppDetailsResult {
    success: boolean;
    total_requested: number;
    total_successful: number;
    total_failed: number;
    cache_hits?: number;
    cache_misses?: number;
    results: AppDetailsResponse[];
    failed?: Array<{ appid: number; error: string }>;
    timestamp: string;
}

import { Logger } from '../../utils/Logger'

export class BatchAppDetailsClient {
    private static readonly logger = Logger.createLogFunctions(BatchAppDetailsClient.name)
    private apiBaseUrl: string;
    private eventManager: EventManager;

    constructor(apiBaseUrl: string = 'https://steam-api-dev.wehrly.com', eventManager?: EventManager) {
        this.apiBaseUrl = apiBaseUrl;
        this.eventManager = eventManager || EventManager.getInstance();
    }

    /**
     * Fetch app details for multiple games in batches
     * 
     * @param appids - Array of Steam app IDs to fetch
     * @param options - Batch options (size, callbacks)
     * @returns Map of appid -> app details data
     */
    async fetchBatch(
        appids: number[],
        options: BatchAppDetailsOptions = {}
    ): Promise<Map<number, AppDetailsResponse>> {
        const {
            batchSize = 100, // Increased: Lambda handles cached games instantly
            onProgress,
            onGameData
        } = options;

        const results = new Map<number, AppDetailsResponse>();
        
        // Split into batches
        const batches: number[][] = [];
        for (let i = 0; i < appids.length; i += batchSize) {
            batches.push(appids.slice(i, i + batchSize));
        }

        const overallStart = performance.now();
        if (batches.length > 0) {
            BatchAppDetailsClient.logger.info(`[ASYNC] Fetching ${appids.length} uncached games from Steam API (${batches.length} network ${batches.length === 1 ? 'batch' : 'batches'})...`)
        }

        let totalFetched = 0;
        let consecutiveFailures = 0;
        let lastBatchDuration = 0; // Track response time for adaptive delays
        const MAX_CONSECUTIVE_FAILURES = 3; // Circuit breaker threshold
        const FAST_RESPONSE_THRESHOLD = 2000; // If batch returns in <2s, it's mostly cached

        // Process batches sequentially to respect rate limits
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            // Circuit breaker: stop if too many consecutive failures
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`🚨 [BatchAppDetails] Circuit breaker triggered after ${consecutiveFailures} consecutive failures. Stopping batch processing.`);
                break;
            }
            
            const batch = batches[batchIndex];
            const batchStartTime = performance.now();
            
            BatchAppDetailsClient.logger.info(`[ASYNC] Starting network batch ${batchIndex + 1}/${batches.length}: Requesting ${batch.length} games from Steam API...`);
            
            // Emit event for UI visibility
            this.eventManager.emit(SteamEventTypes.NetworkFetchProgress, {
                fetched: totalFetched,
                total: appids.length,
                timestamp: Date.now()
            });
            
            try {
                const batchResult = await this.fetchSingleBatch(batch);
                lastBatchDuration = performance.now() - batchStartTime;
                
                // Process successful results
                for (const game of batchResult.results) {
                    results.set(game.appid, game);
                    onGameData?.(game.appid, game.data);
                }

                totalFetched += batchResult.total_successful;
                BatchAppDetailsClient.logger.info(`[ASYNC] Network batch ${batchIndex + 1}/${batches.length}: Fetched ${batchResult.total_successful}/${batch.length} games in ${lastBatchDuration.toFixed(0)}ms (total: ${totalFetched}/${appids.length})`);
                onProgress?.(totalFetched, appids.length);

                // Emit progress event for UI
                this.eventManager.emit(SteamEventTypes.NetworkFetchProgress, {
                    fetched: totalFetched,
                    total: appids.length,
                    timestamp: Date.now()
                });

                // Log cache performance
                if (batchResult.cache_hits !== undefined && batchResult.cache_misses !== undefined) {
                    const cacheHitRate = batchResult.cache_hits / (batchResult.cache_hits + batchResult.cache_misses) * 100;
                    BatchAppDetailsClient.logger.debug(`Batch ${batchIndex + 1} cache: ${batchResult.cache_hits} hits, ${batchResult.cache_misses} misses (${cacheHitRate.toFixed(1)}% hit rate) in ${lastBatchDuration.toFixed(0)}ms`)
                }

                if (batchResult.failed && batchResult.failed.length > 0) {
                    BatchAppDetailsClient.logger.warn(`Batch ${batchIndex + 1} had ${batchResult.failed.length} failures: ${batchResult.failed.map(f => `${f.appid}: ${f.error}`).join(', ')}`)
                }

                consecutiveFailures = 0; // Reset on success

                // Adaptive delay: skip delay if responses are fast (cached), add delay if slow (uncached)
                if (batchIndex < batches.length - 1) {
                    if (lastBatchDuration < FAST_RESPONSE_THRESHOLD) {
                        // Fast response = mostly cached, minimal delay needed
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } else {
                        // Slow response = uncached API calls, add backoff delay
                        const baseDelay = 200;
                        const backoffDelay = Math.min(baseDelay * Math.pow(1.5, consecutiveFailures), 2000);
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                    }
                }

            } catch (error) {
                consecutiveFailures++;
                BatchAppDetailsClient.logger.error(`Batch ${batchIndex + 1} failed: ${String(error)}`)
                
                // Exponential backoff on failure (max 5 seconds)
                const backoffDelay = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), 5000);
                BatchAppDetailsClient.logger.debug(`Waiting ${backoffDelay}ms before next batch due to failure...`)
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }

        const overallDuration = performance.now() - overallStart;
        BatchAppDetailsClient.logger.info(`[ASYNC] Network fetch complete: ${results.size}/${appids.length} games in ${overallDuration.toFixed(0)}ms`);
        if (results.size < appids.length) {
            BatchAppDetailsClient.logger.warn(`${appids.length - results.size} games failed to fetch`);
        }
        return results;
    }

    /**
     * Fetch a single batch via Lambda endpoint
     */
    private async fetchSingleBatch(appids: number[]): Promise<BatchAppDetailsResult> {
        const url = `${this.apiBaseUrl}/batch-appdetails?appids=${appids.join(',')}`;
        
        // Set 35s timeout (Lambda has 30s, API Gateway has 30s max)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Fetch details for a single app (fallback to individual endpoint)
     */
    async fetchSingle(appid: number): Promise<AppDetailsResponse | null> {
        try {
            const response = await fetch(`${this.apiBaseUrl}/appdetails/${appid}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                BatchAppDetailsClient.logger.warn(`Single fetch failed for ${appid}: ${response.status}`)
                return null;
            }

            return await response.json();
        } catch (error) {
            BatchAppDetailsClient.logger.error(`Error fetching appid ${appid}: ${String(error)}`)
            return null;
        }
    }
}
