/**
 * Simplified Steam API Client using composition layers
 */

import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { BatchAppDetailsClient } from './batch/BatchAppDetailsClient'
import { Logger } from '../utils/Logger'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'
import type { SteamGameMetadata } from './types/SteamMetadata'

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
            onProgress?: (current: number, total: number) => void
            onGameLoaded?: (game: SteamGame) => void
            /** Called for each batch of games ready to render. Enables cache-first display. */
            onBatchReady?: (games: SteamGame[], batchIndex: number, totalBatches: number) => void
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 10, onProgress, onGameLoaded, onBatchReady } = options
        const BATCH_SIZE = 18 // One shelf's worth
        
        // Sort by playtime and limit
        const sortedGames = [...steamUser.games]
            .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
            .slice(0, maxGames)

        const appids = sortedGames.map(g => g.appid)
        
        // Single cache read for all games
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        
        // Partition into cached vs uncached
        const cachedAppids = appids.filter(id => this.isMetadataComplete(cachedAppDetails.get(id)))
        const uncachedAppids = appids.filter(id => !this.isMetadataComplete(cachedAppDetails.get(id)))
        
        if (uncachedAppids.length === 0) {
            SteamApiClient.logger.debug(`All ${appids.length} games have complete metadata in cache`)
        } else {
            SteamApiClient.logger.info(`Loading ${appids.length} games: ${cachedAppids.length} cached, ${uncachedAppids.length} to fetch`)
        }
        
        const results: SteamGame[] = []
        
        // PHASE 1: Emit cached games immediately (cache-first for fast startup)
        if (cachedAppids.length > 0 && onBatchReady) {
            const phaseStartTime = performance.now()
            const cachedGames = sortedGames.filter(g => cachedAppids.includes(g.appid))
            const cachedEnhanced: SteamGame[] = []
            
            for (const game of cachedGames) {
                const enhancedGame = this.buildEnhancedGame(game, cachedAppDetails.get(game.appid))
                this.cache.set(`game_${game.appid}`, enhancedGame)
                cachedEnhanced.push(enhancedGame)
                results.push(enhancedGame)
                onGameLoaded?.(enhancedGame)
            }
            
            const buildTime = performance.now() - phaseStartTime
            const buildMsg = `[MAIN THREAD] Built ${cachedEnhanced.length} cached games in ${buildTime.toFixed(1)}ms`
            if (buildTime > 100) {
                SteamApiClient.logger.warn(`${buildMsg} ⚠️ Main thread blocking!`)
            } else {
                SteamApiClient.logger.debug(buildMsg)
            }
            
            // Emit cached games in batches with yielding
            const cachedBatches = Math.ceil(cachedEnhanced.length / BATCH_SIZE)
            const totalEstimatedBatches = Math.ceil(sortedGames.length / BATCH_SIZE)
            const batchStartTime = performance.now()
            let mainThreadTime = 0
            
            for (let i = 0; i < cachedBatches; i++) {
                const batchIterStart = performance.now()
                const batchGames = cachedEnhanced.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
                const isLastCachedBatch = i === cachedBatches - 1
                
                onBatchReady(batchGames, i, totalEstimatedBatches)
                mainThreadTime += performance.now() - batchIterStart
                
                // Yield to main thread between batches
                if (!isLastCachedBatch) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }
            }
            
            const batchEmitTime = performance.now() - batchStartTime
            const asyncTime = batchEmitTime - mainThreadTime
            SteamApiClient.logger.info(`Emitted ${cachedEnhanced.length} cached games in ${cachedBatches} batches`)
            const emitMsg = `[MAIN THREAD] Cached batch emission: ${mainThreadTime.toFixed(1)}ms main thread, ${asyncTime.toFixed(1)}ms async (total ${batchEmitTime.toFixed(1)}ms, avg ${(mainThreadTime / cachedBatches).toFixed(1)}ms/batch)`
            if (mainThreadTime > 500) {
                SteamApiClient.logger.warn(`${emitMsg} ⚠️ Main thread blocking!`)
            } else {
                SteamApiClient.logger.debug(emitMsg)
            }
            onProgress?.(cachedAppids.length, appids.length)
        }
        
        // PHASE 2: Fetch uncached games in background (supplemental batches)
        if (uncachedAppids.length > 0) {
            const fetchPhaseStart = performance.now()
            try {
                const batchResponses = await this.batchClient.fetchBatch(uncachedAppids, {
                    batchSize: 100,
                    onProgress: (fetched, _total) => {
                        onProgress?.(cachedAppids.length + fetched, appids.length)
                    }
                })
                const fetchTime = performance.now() - fetchPhaseStart
                SteamApiClient.logger.debug(`[ASYNC] Fetched ${uncachedAppids.length} uncached games in ${fetchTime.toFixed(1)}ms (network time, non-blocking)`)
                
                const processStartTime = performance.now()
                const fetchedAppDetails = new Map<number, AppDetailsData>()
                for (const [appid, response] of batchResponses.entries()) {
                    fetchedAppDetails.set(appid, this.normalizeBatchData(response.data))
                }
                
                const cacheWriteStart = performance.now()
                if (fetchedAppDetails.size > 0) {
                    await this.appDetailsCache.setMany(fetchedAppDetails)
                }
                const cacheWriteTime = performance.now() - cacheWriteStart
                
                // Build and emit fetched games as supplemental batches
                const uncachedGames = sortedGames.filter(g => uncachedAppids.includes(g.appid))
                const uncachedEnhanced: SteamGame[] = []
                
                for (const game of uncachedGames) {
                    const enhancedGame = this.buildEnhancedGame(game, fetchedAppDetails.get(game.appid))
                    this.cache.set(`game_${game.appid}`, enhancedGame)
                    uncachedEnhanced.push(enhancedGame)
                    results.push(enhancedGame)
                    onGameLoaded?.(enhancedGame)
                }
                
                const processTime = performance.now() - processStartTime
                const processMsg = `[MAIN THREAD] Processed ${uncachedEnhanced.length} fetched games in ${processTime.toFixed(1)}ms (includes ${cacheWriteTime.toFixed(1)}ms cache write)`
                if (processTime > 100) {
                    SteamApiClient.logger.warn(`${processMsg} ⚠️ Main thread blocking!`)
                } else {
                    SteamApiClient.logger.debug(processMsg)
                }
                
                // Emit fetched games as supplemental batches
                if (onBatchReady && uncachedEnhanced.length > 0) {
                    const emitStartTime = performance.now()
                    let emitMainThreadTime = 0
                    const uncachedBatches = Math.ceil(uncachedEnhanced.length / BATCH_SIZE)
                    const startBatchIndex = Math.ceil(cachedAppids.length / BATCH_SIZE)
                    const totalBatches = startBatchIndex + uncachedBatches
                    
                    for (let i = 0; i < uncachedBatches; i++) {
                        const batchIterStart = performance.now()
                        const batchGames = uncachedEnhanced.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
                        const isLastUncachedBatch = i === uncachedBatches - 1
                        
                        onBatchReady(batchGames, startBatchIndex + i, totalBatches)
                        emitMainThreadTime += performance.now() - batchIterStart
                        
                        // Yield to main thread between batches
                        if (!isLastUncachedBatch) {
                            await new Promise(resolve => setTimeout(resolve, 0))
                        }
                    }
                    
                    const emitTime = performance.now() - emitStartTime
                    const emitAsyncTime = emitTime - emitMainThreadTime
                    SteamApiClient.logger.info(`Emitted ${uncachedEnhanced.length} fetched games in ${uncachedBatches} supplemental batches`)
                    SteamApiClient.logger.debug(`[MAIN THREAD] Fetched batch emission: ${emitMainThreadTime.toFixed(1)}ms main thread, ${emitAsyncTime.toFixed(1)}ms async (total ${emitTime.toFixed(1)}ms, avg ${(emitMainThreadTime / uncachedBatches).toFixed(1)}ms/batch)`)
                }
            } catch (error) {
                SteamApiClient.logger.error('Batch fetch failed:', error)
            }
        }
        
        // If no onBatchReady callback, build all games at once (legacy behavior)
        if (!onBatchReady) {
            const allAppDetails = new Map([...cachedAppDetails])
            for (const game of sortedGames) {
                if (!results.find(r => r.appid === game.appid)) {
                    const enhancedGame = this.buildEnhancedGame(game, allAppDetails.get(game.appid))
                    this.cache.set(`game_${game.appid}`, enhancedGame)
                    results.push(enhancedGame)
                    onGameLoaded?.(enhancedGame)
                }
            }
        }
        
        SteamApiClient.logger.info(`Loaded ${results.length} games (${cachedAppids.length} cached, ${uncachedAppids.length} fetched)`)
        return results
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
