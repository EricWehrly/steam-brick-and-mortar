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
    /**
     * Absent means "unknown," not "not free" - a writer that hasn't actually determined pricing
     * (e.g. local-scan, which has no price data at all) must omit this rather than default it to
     * false, so AppDetailsCache.mergeMany doesn't treat a guess as real data. Readers already
     * treat "not exactly true" as "don't show in the free/demo store," which is correct for both
     * "known false" and "unknown."
     */
    is_free?: boolean;
    artwork: {
        header: string | null;
        capsule: string | null;
        capsule_v5: string | null;
        background: string | null;
        background_raw: string | null;
        /**
         * Real library-art CDN URL, validated (never a guess) - the Steam Store API has no field
         * for this at all, so the only source is a locally-discovered librarycache hash (see
         * desktop/tauri-app/src/steam/librarycache.rs) confirmed live before being written here.
         * Optional (not `string | null` like the fields above) so the many existing `artwork`
         * object literals that predate this field don't all need updating - most entries simply
         * don't have one yet.
         */
        library?: string;
    };
    // Additional fields from Steam Store API
    full_data?: Record<string, unknown>;
    /**
     * Our own metadata, not sourced from Steam or SteamSpy - set by scripts/bake-f2p-artwork.sh
     * when this appid's library_600x900.jpg 404'd against Steam's CDN at bake time. Only present
     * (true) on the exceptional case; absent otherwise. See docs/plans/f2p-artwork-bake-plan.md.
     */
    undesirable_for_demo?: boolean;
    /**
     * True when this entry's fields came from a real Steam appdetails source (a live network
     * fetch, or the baked release bundle - itself built from the same source) - as opposed to
     * LocalSteamDataWriter's local-only appinfo.vdf resolution, which always writes
     * NO_LOCAL_ARTWORK and never sets this. Lets AppDetailsCache distinguish "the network was
     * asked and this is genuinely all there is" from "nobody's asked the network yet" - the local
     * writer runs first and would otherwise satisfy a plain "has any entry" check forever. See
     * docs/plans/startup-artwork-resolution-plan.md, Root Cause A.
     */
    artwork_network_checked?: boolean;
    /**
     * Exact artwork URLs already confirmed dead for this appid - any format/route (guessed legacy
     * CDN path, a stale hint, whatever). No taxonomy of *why* a path is dead (CORS vs. 404 vs.
     * genuinely no artwork all record the same way - see
     * docs/plans/startup-artwork-resolution-plan.md). Lives on the same entry as everything else
     * about this appid's artwork rather than a separate cache, specifically so the baked release
     * bundle picks it up for free - the bake/repack scripts already serialize whatever's in
     * AppDetailsCache verbatim. Union-merged (see mergeAppDetails), never replaced wholesale -
     * two independent writers discovering different dead paths must not stomp each other.
     */
    artwork_dead_paths?: string[];
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
}

export interface AppDetailsResponse {
    success: boolean;
    appid: number;
    data?: AppDetailsData;
    unlisted?: boolean;
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
import { PerformanceMonitor, ASYNC_CONTEXT } from '../../utils/PerformanceMonitor'
import { circuitBreaker, CircuitState, ConsecutiveBreaker, ExponentialBackoff, handleAll, isBrokenCircuitError, type CircuitBreakerPolicy } from 'cockatiel'

/**
 * A single 503 from our own Lambda (each failure here already costs a real ~30s round trip -
 * see fetchSingleBatch's timeout comment) is a clear enough "the backend is unhealthy right now"
 * signal on its own - no need to pay for a second confirming failure before we stop hammering it.
 */
const CIRCUIT_BREAKER_CONSECUTIVE_FAILURES_TO_OPEN = 1;
/** First retry probe 10s after opening; doubles each further consecutive break, capped at 5min. */
const CIRCUIT_BREAKER_INITIAL_HALF_OPEN_DELAY_MS = 10_000;
const CIRCUIT_BREAKER_MAX_HALF_OPEN_DELAY_MS = 5 * 60_000;

export class BatchAppDetailsClient {
    private static readonly logger = Logger.createLogFunctions(BatchAppDetailsClient.name)
    private apiBaseUrl: string;
    private eventManager: EventManager;
    /**
     * Shared across every fetchBatch() call on this instance (per cockatiel's own guidance - a
     * circuit breaker only works if it's reused, not recreated per call) so that once this
     * backend is known to be unhealthy, later calls in the same session (a manual library
     * reload, another game's gap-fill) skip straight to failing fast instead of re-discovering
     * the same outage at full latency cost.
     */
    private readonly circuitBreaker: CircuitBreakerPolicy;

    constructor(apiBaseUrl: string = 'https://steam-api-dev.wehrly.com', eventManager?: EventManager) {
        this.apiBaseUrl = apiBaseUrl;
        this.eventManager = eventManager || EventManager.getInstance();

        this.circuitBreaker = circuitBreaker(handleAll, {
            breaker: new ConsecutiveBreaker(CIRCUIT_BREAKER_CONSECUTIVE_FAILURES_TO_OPEN),
            halfOpenAfter: new ExponentialBackoff({
                initialDelay: CIRCUIT_BREAKER_INITIAL_HALF_OPEN_DELAY_MS,
                maxDelay: CIRCUIT_BREAKER_MAX_HALF_OPEN_DELAY_MS,
            }),
        });
        this.circuitBreaker.onBreak(reason => {
            const detail = 'error' in reason ? String(reason.error) : `isolated`;
            BatchAppDetailsClient.logger.warn(`Circuit OPEN for ${this.apiBaseUrl} - backend appears unhealthy (${detail}), skipping further requests until it self-heals`);
        });
        this.circuitBreaker.onHalfOpen(() => {
            BatchAppDetailsClient.logger.info(`Circuit HALF-OPEN for ${this.apiBaseUrl} - probing whether the backend has recovered`);
        });
        this.circuitBreaker.onReset(() => {
            BatchAppDetailsClient.logger.info(`Circuit CLOSED for ${this.apiBaseUrl} - backend has recovered, resuming normal requests`);
        });
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
            batchSize = 100,
            onProgress
        } = options;

        const results = new Map<number, AppDetailsResponse>();
        
        // Split into batches
        const batches: number[][] = [];
        for (let i = 0; i < appids.length; i += batchSize) {
            batches.push(appids.slice(i, i + batchSize));
        }

        // Note: Individual batches are tracked with 'network-batch' monitor per batch
        if (batches.length > 0) {
            BatchAppDetailsClient.logger.info(`[ASYNC] Fetching ${appids.length} uncached games from Steam API (${batches.length} network ${batches.length === 1 ? 'batch' : 'batches'})...`)
        }

        let totalFetched = 0;
        let lastBatchDuration: number; // Track response time for adaptive delays
        const FAST_RESPONSE_THRESHOLD = 2000; // If batch returns in <2s, it's mostly cached

        // Process batches sequentially to respect rate limits
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            // Check before announcing/attempting a batch, not just in the catch block below - an
            // already-open circuit (this call's own earlier failure, or a still-open break from a
            // prior fetchBatch() call on this instance) means every remaining batch is doomed;
            // don't log "Starting batch N" for one we already know we won't attempt.
            if (this.circuitBreaker.state === CircuitState.Open || this.circuitBreaker.state === CircuitState.Isolated) {
                BatchAppDetailsClient.logger.warn(`Skipping ${batches.length - batchIndex} remaining batch(es) - circuit is open for ${this.apiBaseUrl}`);
                break;
            }

            const batch = batches[batchIndex];
            const batchMonitor = PerformanceMonitor.start('network-batch', BatchAppDetailsClient.logger, ASYNC_CONTEXT)
            
            BatchAppDetailsClient.logger.info(`[ASYNC] Starting network batch ${batchIndex + 1}/${batches.length}: Requesting ${batch.length} games from Steam API...`);
            
            // Emit event for UI visibility
            this.eventManager.emit(SteamEventTypes.NetworkFetchProgress, {
                fetched: totalFetched,
                total: appids.length,
                timestamp: Date.now()
            });
            
            try {
                const batchResult = await this.circuitBreaker.execute(() => this.fetchSingleBatch(batch));
                lastBatchDuration = batchMonitor.getElapsed();
                
                // Process successful results
                for (const result of batchResult.results) {
                    results.set(result.appid, result)
                }

                totalFetched += batchResult.total_successful;
                
                // Calculate total work: if fetching N games in parallel, total work ≈ N × elapsed
                // (Each game's metadata fetch would take ~elapsed ms if done sequentially)
                const totalWork = batch.length * lastBatchDuration;
                
                batchMonitor.end({
                    batch: `${batchIndex + 1}/${batches.length}`,
                    successful: `${batchResult.total_successful}/${batch.length}`,
                    total: `${totalFetched}/${appids.length}`
                }, totalWork);
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

                // Adaptive delay: skip delay if responses are fast (cached), add delay if slow (uncached)
                if (batchIndex < batches.length - 1) {
                    const delay = lastBatchDuration < FAST_RESPONSE_THRESHOLD ? 50 : 200;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

            } catch (error) {
                if (isBrokenCircuitError(error)) {
                    // The breaker already opened from an earlier failure (this run or a prior
                    // one on this same client instance) - don't burn another ~30s round trip on
                    // a request we already know the backend will fail. Whatever's left in
                    // `appids` stays unresolved this call; the breaker's own half-open probe
                    // (see constructor) is what retries later, not this loop.
                    BatchAppDetailsClient.logger.warn(`Stopping batch processing - circuit is open for ${this.apiBaseUrl}, ${batches.length - batchIndex} batch(es) skipped`);
                    break;
                }
                BatchAppDetailsClient.logger.error(`Batch ${batchIndex + 1} failed: ${String(error)}`)
            }
        }

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
