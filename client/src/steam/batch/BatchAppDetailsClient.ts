/**
 * Batch client for fetching Steam app details from Lambda cache
 * 
 * Provides efficient batch fetching of game metadata (categories, genres, etc.)
 * from the Lambda-cached Steam Store API data.
 */

export interface AppDetailsData {
    name: string;
    type: string;
    is_free: boolean;
    short_description: string;
    artwork: {
        header: string | null;
        capsule: string | null;
        capsule_v5: string | null;
        background: string | null;
        background_raw: string | null;
    };
    // Additional fields from Steam Store API (except detailed_description/about_the_game)
    [key: string]: unknown;
}

export interface BatchAppDetailsOptions {
    /**
     * Batch size for requests (recommended ~50 for optimal performance)
     * Lambda has no hard limit, but smaller batches = faster responses
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
    results: AppDetailsResponse[];
    failed?: Array<{ appid: number; error: string }>;
    timestamp: string;
}

export class BatchAppDetailsClient {
    private apiBaseUrl: string;

    constructor(apiBaseUrl: string = 'https://steam-api-dev.wehrly.com') {
        this.apiBaseUrl = apiBaseUrl;
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
            batchSize = 50,
            onProgress,
            onGameData
        } = options;

        const results = new Map<number, AppDetailsResponse>();
        
        // Split into batches
        const batches: number[][] = [];
        for (let i = 0; i < appids.length; i += batchSize) {
            batches.push(appids.slice(i, i + batchSize));
        }

        if (batches.length > 1) {
            console.log(`🔄 [BatchAppDetails] Fetching ${appids.length} games in ${batches.length} batches`);
        }

        let totalFetched = 0;

        // Process batches sequentially to respect rate limits
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            
            try {
                const batchResult = await this.fetchSingleBatch(batch);
                
                // Process successful results
                for (const game of batchResult.results) {
                    results.set(game.appid, game);
                    onGameData?.(game.appid, game.data);
                }

                totalFetched += batchResult.total_successful;
                onProgress?.(totalFetched, appids.length);

                if (batchResult.failed && batchResult.failed.length > 0) {
                    console.warn(`⚠️ [BatchAppDetails] Batch ${batchIndex + 1} had ${batchResult.failed.length} failures:`, 
                        batchResult.failed.map(f => `${f.appid}: ${f.error}`).join(', '));
                }

                // Small delay between batches
                if (batchIndex < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

            } catch (error) {
                console.error(`❌ [BatchAppDetails] Batch ${batchIndex + 1} failed:`, error);
                // Continue with next batch despite error
            }
        }

        if (results.size < appids.length) {
            console.warn(`⚠️ [BatchAppDetails] Fetched ${results.size}/${appids.length} games (${appids.length - results.size} failed)`);
        }
        return results;
    }

    /**
     * Fetch a single batch via Lambda endpoint
     */
    private async fetchSingleBatch(appids: number[]): Promise<BatchAppDetailsResult> {
        const url = `${this.apiBaseUrl}/batch-appdetails?appids=${appids.join(',')}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
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
                console.warn(`⚠️ [BatchAppDetails] Single fetch failed for ${appid}: ${response.status}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`❌ [BatchAppDetails] Error fetching appid ${appid}:`, error);
            return null;
        }
    }
}
