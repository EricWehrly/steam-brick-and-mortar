/**
 * Simplified Steam API Client using composition layers
 */

import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { BatchAppDetailsClient } from './batch/BatchAppDetailsClient'
import { Logger } from '../utils/Logger'
import { PerformanceMonitor, ASYNC_CONTEXT, MAIN_THREAD_CONTEXT } from '../utils/PerformanceMonitor'
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
    /** Unix timestamp of last play session. 0 means never played (but owned). */
    rtime_last_played?: number
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
    public async resolveVanityUrl(vanityUrl: string, ignoreCache = false): Promise<SteamResolveResponse> {
        if (!vanityUrl || vanityUrl.trim().length === 0) {
            throw new Error('Vanity URL cannot be empty')
        }

        const cleanVanityUrl = vanityUrl.trim().toLowerCase()
        const cacheKey = `resolve_${cleanVanityUrl}`
        
        // Check cache first if not ignoring cache
        if (!ignoreCache) {
            const cached = this.cache.get<SteamResolveResponse>(cacheKey)
            if (cached) {
                SteamApiClient.logger.debug(`Using cached vanity URL resolution for: ${cleanVanityUrl}`)
                return cached
            }
        }
        
        // Make API request
        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`
        SteamApiClient.logger.debug(`Resolving vanity URL: "${vanityUrl}" -> "${cleanVanityUrl}"`)
        
        const rawResponse = await this.http.makeRequest<unknown>(endpoint)
        const response = this.normalizeResolveResponse(rawResponse, cleanVanityUrl)
        SteamApiClient.logger.info(`Vanity URL resolved: ${response.vanity_url || cleanVanityUrl}`)
        
        // Cache the result
        this.cache.set(cacheKey, response)
        
        return response
    }

    private normalizeResolveResponse(response: unknown, requestedVanityUrl: string): SteamResolveResponse {
        const isObject = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null

        if (!isObject(response)) {
            throw new Error('Invalid resolve vanity URL response shape')
        }

        if (response.success === false) {
            const message = typeof response.message === 'string' ? response.message : 'Failed to resolve vanity URL'
            throw new Error(message)
        }

        const payload = response.success === true && isObject(response.data) ? response.data : response
        const steamid = typeof payload.steamid === 'string' ? payload.steamid : undefined
        if (!steamid) {
            throw new Error('Invalid resolve vanity URL response shape')
        }

        return {
            steamid,
            vanity_url: typeof payload.vanity_url === 'string' ? payload.vanity_url : requestedVanityUrl,
            resolved_at: typeof payload.resolved_at === 'string' ? payload.resolved_at : new Date().toISOString()
        }
    }

    /**
     * Get user's Steam games with caching
     * 
     * @param steamId - The 17-digit Steam ID
     * @returns Promise<SteamUser> - Contains games list and user info
     */
    public async getUserGames(steamId: string, ignoreCache = false): Promise<SteamUser> {
        if (!steamId || steamId.trim().length === 0) {
            throw new Error('Steam ID cannot be empty')
        }

        const cacheKey = `games_${steamId}`
        
        // Check cache first if not ignoring cache
        if (!ignoreCache) {
            const cached = this.cache.get<SteamUser>(cacheKey)
            if (cached) {
                SteamApiClient.logger.debug(`Using cached games data for Steam ID: ${steamId}`)
                return cached
            }
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
        // Handle negative caching shells gracefully (data might be undefined or missing fields)
        if (!data) return {} as AppDetailsData;
        
        const fullData = data.full_data as Record<string, unknown> | undefined
        return {
            ...data,
            categories: data.categories || (fullData?.categories as AppDetailsData['categories']),
            genres: data.genres || (fullData?.genres as AppDetailsData['genres']),
            developers: data.developers || (fullData?.developers as string[]),
            publishers: data.publishers || (fullData?.publishers as string[]),
            release_date: data.release_date || (fullData?.release_date as AppDetailsData['release_date']),
            metacritic: data.metacritic || (fullData?.metacritic as AppDetailsData['metacritic']),
            // Lift SteamSpy fields if present in full_data
            steamspy_tags: data.steamspy_tags || (fullData?.tags as Record<string, number>),
            positive: data.positive || (fullData?.positive as number),
            negative: data.negative || (fullData?.negative as number),
            userscore: data.userscore || (fullData?.userscore as number),
            owners: data.owners || (fullData?.owners as string)
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
            // Use SteamSpy name if base name is empty or missing
            name: appDetails?.name && appDetails.name !== 'Unknown Game' ? appDetails.name : game.name,
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
            short_description: appDetails?.short_description,
            steamspy_tags: appDetails?.steamspy_tags,
            positive: appDetails?.positive,
            negative: appDetails?.negative,
            userscore: appDetails?.userscore,
            owners: appDetails?.owners
        }
    }

    /**
     * Load games with single-pass cache check and fetch
     *
     * Games are emitted progressively as they become available:
     * - Cached games are enhanced and emitted immediately
     * - Uncached games are fetched from the network and emitted as each
     *   network batch (100 games) resolves
     *
     * Both paths feed the same progressive emitter so there is no
     * bifurcation of batch emission logic.
     */
    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
            /** Optional comparator to override default playtime-descending sort. */
            sortFn?: (a: SteamGame, b: SteamGame) => number
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 9999, sortFn } = options
        const BATCH_SIZE = 18 // One shelf's worth

        const sortedGames = this.sortAndLimitGames(steamUser.games, maxGames, sortFn)
        const appids = sortedGames.map(g => g.appid)

        const { cachedAppids, uncachedAppids, cachedAppDetails } = await this.partitionByCache(appids)

        const cachedBatchCount = Math.ceil(cachedAppids.length / BATCH_SIZE)
        const uncachedBatchCount = Math.ceil(uncachedAppids.length / BATCH_SIZE)
        const totalBatchCount = cachedBatchCount + uncachedBatchCount

        // Shared progressive emitter — both paths push games through this.
        // It accumulates games, flushes full shelves (BATCH_SIZE), and yields
        // between each flush so the render pipeline can process before the next arrives.
        let pendingGames: SteamGame[] = []
        let renderBatchIndex = 0

        const flush = async (force = false) => {
            while (pendingGames.length >= BATCH_SIZE || (force && pendingGames.length > 0)) {
                const batch = pendingGames.splice(0, BATCH_SIZE)
                EventManager.getInstance().emit<SteamGamesBatchEvent>(SteamEventTypes.GamesBatchReady, {
                    games: batch as ReadonlyArray<Readonly<SteamGame>>,
                    batchIndex: renderBatchIndex,
                    totalBatches: totalBatchCount
                })
                renderBatchIndex++
                await new Promise(resolve => setTimeout(resolve, 0))
            }
        }

        // PHASE 1: Cached games — build and feed immediately
        const buildMonitor = PerformanceMonitor.start('build-cached-games', SteamApiClient.logger, MAIN_THREAD_CONTEXT)
        const cachedGames = sortedGames.filter(g => cachedAppids.includes(g.appid))
        for (const game of cachedGames) {
            const enhanced = this.buildEnhancedGame(game, cachedAppDetails.get(game.appid))
            this.cache.set(`game_${game.appid}`, enhanced)
            pendingGames.push(enhanced)
            await flush()
        }
        // Flush any partial remainder from the cached phase before uncached games start.
        // Without this, leftover games in the buffer mix with uncached games and the
        // batchIndex sequence diverges from totalBatchCount, leaving BatchCoordinator
        // waiting for a batch that never arrives ("Placing shelf N" stuck UI).
        if (uncachedAppids.length > 0) {
            await flush(true)
        }
        buildMonitor.end({ count: cachedGames.length })

        // Emit network fetch progress so the UI can show a loading indicator
        if (uncachedAppids.length > 0) {
            EventManager.getInstance().emit<SteamNetworkFetchProgressEvent>(SteamEventTypes.NetworkFetchProgress, {
                fetched: cachedAppids.length,
                total: sortedGames.length
            })
        }

        // PHASE 2: Uncached games — fire-and-forget; feeds the same emitter as each
        // network batch resolves so games appear progressively without a blank wall.
        if (uncachedAppids.length > 0) {
            const gameByAppid = new Map<number, SteamGame>(sortedGames.map(g => [g.appid, g]))
            const fetchedAppDetails = new Map<number, AppDetailsData>()

            // Run in background; unhandled rejection is caught and logged
            this.batchClient.fetchBatch(uncachedAppids, { batchSize: 100 })
                .then(async (batchResponses) => {
                    for (const [appid, response] of batchResponses.entries()) {
                        const dataToNormalize = response.success === false && response.unlisted
                            ? (response as unknown as AppDetailsData)
                            : response.data
                        const normalized = this.normalizeBatchData(dataToNormalize)
                        fetchedAppDetails.set(appid, normalized)

                        const baseGame = gameByAppid.get(appid)
                        if (!baseGame) continue

                        const enhanced = this.buildEnhancedGame(baseGame, normalized)
                        this.cache.set(`game_${appid}`, enhanced)
                        pendingGames.push(enhanced)
                        await flush()
                    }

                    // Flush any remaining partial shelf
                    await flush(true)

                    if (fetchedAppDetails.size > 0) {
                        const cacheMonitor = PerformanceMonitor.start('cache-metadata', SteamApiClient.logger, ASYNC_CONTEXT)
                        await this.appDetailsCache.setMany(fetchedAppDetails)
                        cacheMonitor.end({ count: fetchedAppDetails.size })
                    }

                    SteamApiClient.logger.info(
                        `[ASYNC] Emitted ${fetchedAppDetails.size} uncached games progressively in ${renderBatchIndex - cachedBatchCount} rendering batches`
                    )
                })
                .catch(error => {
                    SteamApiClient.logger.error('[ASYNC] Background metadata fetch failed:', error)
                })
        } else {
            // All games were cached — flush remainder now
            await flush(true)
        }

        SteamApiClient.logger.info(`Loaded ${cachedGames.length} cached games, ${uncachedAppids.length} fetching in background`)
        return cachedGames
    }

    private sortAndLimitGames(games: SteamGame[], maxGames: number, sortFn?: (a: SteamGame, b: SteamGame) => number): SteamGame[] {
        const comparator = sortFn ?? ((a: SteamGame, b: SteamGame) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
        return [...games]
            .sort(comparator)
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
