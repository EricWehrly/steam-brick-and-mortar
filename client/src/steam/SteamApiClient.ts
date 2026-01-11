/**
 * Simplified Steam API Client using composition layers
 */

import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { BatchAppDetailsClient } from './batch/BatchAppDetailsClient'
import { Logger } from '../utils/Logger'
import { PerformanceTimer } from '../utils/PerformanceTimer'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import type { SteamGameMetadata } from './types/SteamMetadata'
import { EventManager } from '../core/EventManager'
import { SteamEventTypes } from '../types/InteractionEvents'
import type { SteamGamesBatchEvent, SteamNetworkFetchProgressEvent } from '../types/InteractionEvents'

export interface SteamGame extends SteamGameMetadata {
    appid: number
    name: string
    playtime_forever: number
    playtime_2weeks?: number
    img_icon_url: string
    img_logo_url: string
    artwork: {
        icon: string
        logo: string
        header: string
        library: string
    }
}

export interface SteamUser {
    steamid: string
    vanity_url?: string
    game_count: number
    games: SteamGame[]
    retrieved_at: string
}

export interface SteamResolveResponse {
    vanity_url: string
    steamid: string
    resolved_at: string
}

export interface SteamApiError {
    error: string
    message: string
    timestamp: string
}

/**
 * Simplified Steam API Client using layered composition
 * 
 * All public methods include explicit caching logic for transparency and easier debugging.
 */
export class SteamApiClient {
    private static readonly logger = Logger.createLogFunctions(SteamApiClient.name)
    private http: HttpClient
    private cache: CacheManager
    private rateLimiter: RateLimiter
    private batchClient: BatchAppDetailsClient
    private appDetailsCache: AppDetailsCache

    // TODO: Tear this out of history, and resolve the value from terraform outputs
    constructor(apiBaseUrl = 'https://steam-api-dev.wehrly.com') {
        // Initialize all layers
        this.http = new HttpClient({ baseUrl: apiBaseUrl })
        this.cache = new CacheManager({ cachePrefix: 'steam_api_' })
        this.rateLimiter = new RateLimiter({ requestsPerSecond: 4 })
        this.batchClient = new BatchAppDetailsClient(apiBaseUrl)
        this.appDetailsCache = new AppDetailsCache()
        
        // Initialize app details cache
        this.appDetailsCache.init().catch(error => {
            console.warn('⚠️ [SteamApiClient] Failed to initialize app details cache:', error)
        })
    }

    /**
     * Resolve Steam vanity URL to Steam ID with caching
     * 
     * @param vanityUrl - The custom URL part (e.g., "SpiteMonger")
     * @returns Promise<SteamResolveResponse> - Contains steamid and vanity_url
     */
    public async resolveVanityUrl(vanityUrl: string): Promise<SteamResolveResponse> {
        if (!vanityUrl || vanityUrl.trim().length === 0) {
            throw new Error('Vanity URL cannot be empty')
        }

        const cleanVanityUrl = vanityUrl.trim().toLowerCase()
        const cacheKey = `resolve_${cleanVanityUrl}`
        
        // Check cache first
        const cached = this.cache.get<SteamResolveResponse>(cacheKey)
        if (cached) {
            SteamApiClient.logger.debug(`Using cached vanity URL resolution for: ${cleanVanityUrl}`)
            return cached
        }
        
        // Make API request
        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`
        SteamApiClient.logger.debug(`Resolving vanity URL: "${vanityUrl}" -> "${cleanVanityUrl}"`)
        
        try {
            const response = await this.http.makeRequest<SteamResolveResponse>(endpoint)
            SteamApiClient.logger.info(`Vanity URL resolved: ${response.vanity_url || cleanVanityUrl}`)
            
            // Cache the result
            this.cache.set(cacheKey, response)
            
            return response
        } catch (error) {
            // Let the calling code handle error logging with proper context  
            throw error
        }
    }

    /**
     * Get user's Steam games with caching
     * 
     * @param steamId - The 17-digit Steam ID
     * @returns Promise<SteamUser> - Contains games list and user info
     */
    public async getUserGames(steamId: string): Promise<SteamUser> {
        if (!steamId || steamId.trim().length === 0) {
            throw new Error('Steam ID cannot be empty')
        }

        const cacheKey = `games_${steamId}`
        
        // Check cache first
        const cached = this.cache.get<SteamUser>(cacheKey)
        if (cached) {
            SteamApiClient.logger.debug(`Using cached games data for Steam ID: ${steamId}`)
            return cached
        }
        
        // Make API request
        const endpoint = `/games/${encodeURIComponent(steamId)}`
        SteamApiClient.logger.debug(`Fetching games for Steam ID: ${steamId}`)
        
        try {
            const response = await this.http.makeRequest<SteamUser>(endpoint)
            SteamApiClient.logger.info(`Fetched ${response.game_count} games for ${response.vanity_url || steamId}`)
            
            if (response.game_count === 0) {
                SteamApiClient.logger.warn('User has 0 games - this might indicate privacy settings or an empty library')
            }
            
            // Cache the result
            this.cache.set(cacheKey, response)
            
            return response
        } catch (error) {
            SteamApiClient.logger.error('Failed to fetch user games:', error)
            throw error
        }
    }

    /**
     * Get enhanced game details with artwork URLs, caching, and rate limiting
     * 
     * @param game - Basic game info from Steam API
     * @returns Promise<SteamGame> - Enhanced game with artwork URLs
     */
    public async getGameDetails(game: SteamGame): Promise<SteamGame> {
        const cacheKey = `game_${game.appid}`
        
        // Check cache first
        const cached = this.cache.get<SteamGame>(cacheKey)
        if (cached) {
            return cached
        }
        
        // Apply rate limiting for this operation
        const enhancedGame = await this.rateLimiter.limited(async () => {
            // Enhance game with artwork URLs - handle missing image URLs gracefully
            const enhanced: SteamGame = {
                ...game,
                artwork: {
                    icon: game.img_icon_url 
                        ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
                        : '',
                    logo: game.img_logo_url 
                        ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
                        : '',
                    header: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`,
                    library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
                }
            }
            
            return enhanced
        })()
        
        // Cache the result
        this.cache.set(cacheKey, enhancedGame)
        
        return enhancedGame
    }
    
    /**
     * Check if cache has complete metadata for a game
     */
    private isMetadataComplete(cached: AppDetailsData | undefined): boolean {
        if (!cached) return false
        const hasCategories = cached.categories && Array.isArray(cached.categories) && cached.categories.length > 0
        const hasGenres = cached.genres && Array.isArray(cached.genres) && cached.genres.length > 0
        return hasCategories || hasGenres
    }

    /**
     * Normalize batch response data (lift nested fields to top level)
     */
    private normalizeBatchData(data: AppDetailsData): AppDetailsData {
        const fullData = data?.full_data as Record<string, unknown> | undefined
        return {
            ...data,
            categories: data.categories || (fullData?.categories as AppDetailsData['categories']),
            genres: data.genres || (fullData?.genres as AppDetailsData['genres']),
            developers: data.developers || (fullData?.developers as string[]),
            publishers: data.publishers || (fullData?.publishers as string[]),
            release_date: data.release_date || (fullData?.release_date as AppDetailsData['release_date']),
            metacritic: data.metacritic || (fullData?.metacritic as AppDetailsData['metacritic']),
        }
    }

    /**
     * Build enhanced SteamGame object from base game + app details
     */
    private buildEnhancedGame(game: SteamGame, appDetails: AppDetailsData | undefined): SteamGame {
        const headerUrl = appDetails?.artwork?.header 
            || appDetails?.artwork?.capsule_v5 
            || appDetails?.artwork?.capsule
            || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`

        return {
            ...game,
            artwork: {
                icon: game.img_icon_url 
                    ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
                    : '',
                logo: game.img_logo_url 
                    ? `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
                    : '',
                header: headerUrl,
                library: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`
            },
            categories: appDetails?.categories,
            genres: appDetails?.genres,
            developers: appDetails?.developers,
            publishers: appDetails?.publishers,
            release_date: appDetails?.release_date,
            metacritic: appDetails?.metacritic,
            short_description: appDetails?.short_description
        }
    }

    /**
     * Load games with single-pass cache check and fetch
     * 
     * Optimized for fast cached loads:
     * 1. Single IndexedDB read for all games
     * 2. Only fetch games missing complete metadata
     * 3. Build enhanced game objects directly
     * 
     * @param steamUser - Steam user data with games list
     * @param options - maxGames limits display, onProgress for UI updates, onBatchReady for progressive batches
     */
    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 10 } = options
        const BATCH_SIZE = 18 // One shelf's worth
        
        const sortedGames = this.sortAndLimitGames(steamUser.games, maxGames)
        const appids = sortedGames.map(g => g.appid)
        
        const { cachedAppids, uncachedAppids, cachedAppDetails } = await this.partitionByCache(appids)
        
        // Calculate total batches using per-phase rounding to match actual emission
        // This prevents off-by-one errors when cached+uncached rounds differently than total
        const cachedBatchCount = Math.ceil(cachedAppids.length / BATCH_SIZE)
        const uncachedBatchCount = Math.ceil(uncachedAppids.length / BATCH_SIZE)
        const totalBatchCount = cachedBatchCount + uncachedBatchCount
        
        // PHASE 1: Emit cached games immediately (cache-first for fast startup)
        let results: SteamGame[] = []
        if (cachedAppids.length > 0) {
            const cachedGames = await this.emitCachedGameBatches(
                sortedGames, cachedAppids, cachedAppDetails,
                totalBatchCount, BATCH_SIZE
            )
            results = cachedGames
        }
        
        // PHASE 2: Fetch uncached games in background (emit when ready)
        if (uncachedAppids.length > 0) {
            await this.fetchUncachedGamesInBackground(
                sortedGames, uncachedAppids, cachedAppids.length, totalBatchCount, BATCH_SIZE
            )
        }
        
        SteamApiClient.logger.info(`Loaded ${results.length} cached games, ${uncachedAppids.length} fetching in background`)
        return results
    }

    private sortAndLimitGames(games: SteamGame[], maxGames: number): SteamGame[] {
        return [...games]
            .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
            .slice(0, maxGames)
    }

    private async partitionByCache(appids: number[]): Promise<{
        cachedAppids: number[]
        uncachedAppids: number[]
        cachedAppDetails: Map<number, AppDetailsData>
    }> {
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        const cachedAppids = appids.filter(id => this.isMetadataComplete(cachedAppDetails.get(id)))
        const uncachedAppids = appids.filter(id => !this.isMetadataComplete(cachedAppDetails.get(id)))
        
        if (uncachedAppids.length === 0) {
            SteamApiClient.logger.debug(`All ${appids.length} games have complete metadata in cache`)
        } else {
            SteamApiClient.logger.info(`Loading ${appids.length} games: ${cachedAppids.length} cached, ${uncachedAppids.length} to fetch`)
        }
        
        return { cachedAppids, uncachedAppids, cachedAppDetails }
    }

    private async emitCachedGameBatches(
        sortedGames: SteamGame[],
        cachedAppids: number[],
        cachedAppDetails: Map<number, AppDetailsData>,
        totalBatchCount: number,
        BATCH_SIZE: number
    ): Promise<SteamGame[]> {
        const buildTimer = PerformanceTimer.start('Built cached games', SteamApiClient.logger)
        const cachedGames = sortedGames.filter(g => cachedAppids.includes(g.appid))
        const cachedEnhanced: SteamGame[] = []
        
        // Build all cached games with metadata
        for (const game of cachedGames) {
            const enhancedGame = this.buildEnhancedGame(game, cachedAppDetails.get(game.appid))
            this.cache.set(`game_${game.appid}`, enhancedGame)
            cachedEnhanced.push(enhancedGame)
        }
        
        buildTimer.end({ count: cachedEnhanced.length }, { threshold: 100, context: 'MAIN THREAD' })
        
        // Emit cached games in batches with yielding
        const cachedBatches = Math.ceil(cachedEnhanced.length / BATCH_SIZE)
        const batchEmitTimer = PerformanceTimer.start('Cached batch emission', SteamApiClient.logger)
        const mainThreadTimer = PerformanceTimer.start('Main thread work', SteamApiClient.logger)
        
        for (let i = 0; i < cachedBatches; i++) {
            const iterTimer = mainThreadTimer.startChild('Batch iteration')
            const batchGames = cachedEnhanced.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
            const isLastCachedBatch = i === cachedBatches - 1
            
            EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                games: batchGames as ReadonlyArray<Readonly<SteamGame>>,
                batchIndex: i,
                totalBatches: totalBatchCount
            })
            iterTimer.end()
            
            // Yield to main thread between batches
            if (!isLastCachedBatch) {
                await new Promise(resolve => setTimeout(resolve, 0))
            }
        }
        
        const mainThreadTime = mainThreadTimer.getElapsed()
        const batchEmitTime = batchEmitTimer.getElapsed()
        const asyncTime = batchEmitTime - mainThreadTime
        SteamApiClient.logger.info(`Emitted ${cachedEnhanced.length} cached games in ${cachedBatches} batches`)
        batchEmitTimer.end({ 
            mainThread: mainThreadTime, 
            async: asyncTime, 
            total: batchEmitTime, 
            avgPerBatch: mainThreadTime / cachedBatches 
        }, { threshold: 500, context: 'MAIN THREAD' })
        
        EventManager.getInstance().emit<SteamNetworkFetchProgressEvent>(SteamEventTypes.NetworkFetchProgress, {
            fetched: cachedAppids.length,
            total: sortedGames.length
        })
        
        return cachedEnhanced
    }

    private async fetchUncachedGamesInBackground(
        sortedGames: SteamGame[],
        uncachedAppids: number[],
        cachedAppidsCount: number,
        totalBatchCount: number,
        BATCH_SIZE: number
    ): Promise<void> {
        // Fetch metadata in background and emit events when ready
        this.fetchMetadataBackground(uncachedAppids, sortedGames, cachedAppidsCount, totalBatchCount, BATCH_SIZE)
            .catch(error => {
                SteamApiClient.logger.error('Background metadata fetch failed:', error)
            })
    }

    private async fetchMetadataBackground(
        uncachedAppids: number[],
        sortedGames: SteamGame[],
        cachedAppidsCount: number,
        totalBatchCount: number,
        BATCH_SIZE: number
    ): Promise<void> {
        const fetchTimer = PerformanceTimer.start('Background metadata fetch', SteamApiClient.logger)
        SteamApiClient.logger.debug(`[ASYNC] Starting background metadata fetch for ${uncachedAppids.length} games`)
        
        try {
            const batchResponses = await this.batchClient.fetchBatch(uncachedAppids, {
                batchSize: 100
            })
            fetchTimer.end({ count: uncachedAppids.length }, { context: 'ASYNC', level: 'info' })
            
            // Normalize and cache fetched metadata
            const fetchedAppDetails = new Map<number, AppDetailsData>()
            for (const [appid, response] of batchResponses.entries()) {
                fetchedAppDetails.set(appid, this.normalizeBatchData(response.data))
            }
            
            const cacheTimer = PerformanceTimer.start('Cached metadata', SteamApiClient.logger)
            if (fetchedAppDetails.size > 0) {
                await this.appDetailsCache.setMany(fetchedAppDetails)
                cacheTimer.end({ count: fetchedAppDetails.size }, { context: 'ASYNC' })
            }
            
            // Build enhanced games with fetched metadata
            const uncachedGames = sortedGames.filter(g => uncachedAppids.includes(g.appid))
            const uncachedEnhanced: SteamGame[] = []
            
            for (const game of uncachedGames) {
                const enhancedGame = this.buildEnhancedGame(game, fetchedAppDetails.get(game.appid))
                this.cache.set(`game_${game.appid}`, enhancedGame)
                uncachedEnhanced.push(enhancedGame)
            }
            
            // Emit uncached games in batches (now that they have metadata)
            const uncachedBatches = Math.ceil(uncachedEnhanced.length / BATCH_SIZE)
            const startBatchIndex = Math.ceil(cachedAppidsCount / BATCH_SIZE)
            
            for (let i = 0; i < uncachedBatches; i++) {
                const batchGames = uncachedEnhanced.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
                
                EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                    games: batchGames as ReadonlyArray<Readonly<SteamGame>>,
                    batchIndex: startBatchIndex + i,
                    totalBatches: totalBatchCount
                })
                
                // Yield to main thread between batches
                if (i < uncachedBatches - 1) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }
            
            SteamApiClient.logger.info(`[ASYNC] Emitted ${uncachedEnhanced.length} uncached games with metadata in ${uncachedBatches} batches`)
            
        } catch (error) {
            SteamApiClient.logger.error('[ASYNC] Background metadata fetch failed:', error)
            throw error
        }
    }

    /**
     * App details methods (for categories, genres, etc.)
     */
    public async getAppDetails(appid: number): Promise<AppDetailsData | null> {
        return this.appDetailsCache.get(appid)
    }

    public async getAppDetailsMany(appids: number[]): Promise<Map<number, AppDetailsData>> {
        return this.appDetailsCache.getMany(appids)
    }

    public async getAppDetailsCacheStats() {
        return this.appDetailsCache.getStats()
    }

    public async clearCache(): Promise<void> {
        this.cache.clear()
        await this.appDetailsCache.clear()
    }

    public getCacheStats() {
        return this.cache.getStats()
    }

    public getCacheManager(): CacheManager {
        return this.cache
    }
    
    public hasCached(key: string): boolean {
        return this.cache.get(key) !== null
    }
    
    public getCached<T>(key: string): T | null {
        return this.cache.get<T>(key)
    }

    public getAllCacheKeys(): string[] {
        return this.cache.getAllKeys()
    }

    public getCachedUsers(): Array<{ vanityUrl: string, displayName: string, gameCount: number, steamId: string }> {
        const cachedUsers: Array<{ vanityUrl: string, displayName: string, gameCount: number, steamId: string }> = []
        const userMap = new Map<string, { vanityUrl?: string, resolveData?: SteamResolveResponse, gamesData?: SteamUser }>()
        
        // Single pass through all cache keys to collect user data
        const allKeys = this.cache.getAllKeys()
        
        for (const key of allKeys) {
            if (key.startsWith('resolve_')) {
                const vanityUrl = key.replace('resolve_', '')
                const resolveData = this.cache.get<SteamResolveResponse>(key)
                if (resolveData && resolveData.steamid) {
                    const existing = userMap.get(resolveData.steamid) || {}
                    existing.vanityUrl = vanityUrl
                    existing.resolveData = resolveData
                    userMap.set(resolveData.steamid, existing)
                }
            } else if (key.startsWith('games_')) {
                const steamId = key.replace('games_', '')
                const gamesData = this.cache.get<SteamUser>(key)
                if (gamesData) {
                    const existing = userMap.get(steamId) || {}
                    existing.gamesData = gamesData
                    userMap.set(steamId, existing)
                }
            }
        }
        
        // Build final user list from users who have both resolve and games data
        for (const [steamId, userData] of userMap.entries()) {
            if (userData.resolveData && userData.gamesData) {
                cachedUsers.push({
                    vanityUrl: userData.vanityUrl || userData.gamesData.vanity_url || steamId,
                    displayName: userData.gamesData.vanity_url || userData.vanityUrl || steamId,
                    gameCount: userData.gamesData.game_count || 0,
                    steamId: steamId
                })
            }
        }
        
        return cachedUsers.sort((a, b) => a.displayName.localeCompare(b.displayName))
    }
}

// Export a default instance for convenience
export const steamApi = new SteamApiClient()
