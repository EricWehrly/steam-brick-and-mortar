/**
 * Simplified Steam API Client using composition layers
 */

import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { ImageManager } from './images/ImageManager'
import { BatchAppDetailsClient } from './batch/BatchAppDetailsClient'
import { Logger } from '../utils/Logger'
import { AppDetailsCache } from './cache/AppDetailsCache'
import type { AppDetailsData } from './batch/BatchAppDetailsClient'

export interface SteamGame {
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
    private static readonly logger = Logger.withContext(SteamApiClient.name)
    private http: HttpClient
    private cache: CacheManager
    private rateLimiter: RateLimiter
    private images: ImageManager
    private batchClient: BatchAppDetailsClient
    private appDetailsCache: AppDetailsCache

    // TODO: Tear this out of history, and resolve the value from terraform outputs
    constructor(apiBaseUrl = 'https://steam-api-dev.wehrly.com') {
        // Initialize all layers
        this.http = new HttpClient({ baseUrl: apiBaseUrl })
        this.cache = new CacheManager({ cachePrefix: 'steam_api_' })
        this.rateLimiter = new RateLimiter({ requestsPerSecond: 4 })
        this.images = ImageManager.getInstance()
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
     * Public utility methods
     */
    
    /**
     * Update game artwork URLs from cached batch metadata
     * Modifies games in-place to use new CDN URLs from batch API cache
     * 
     * @param steamUser - Steam user with games to update
     */
    public async updateGameArtworkFromCache(steamUser: SteamUser): Promise<void> {
        const appids = steamUser.games.map(g => g.appid)
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        
        let updatedCount = 0
        for (const game of steamUser.games) {
            const appDetails = cachedAppDetails.get(game.appid)
            if (!appDetails?.artwork) continue
            
            // Update header URL if we have valid batch API artwork
            const newHeaderUrl = appDetails.artwork.header 
                || appDetails.artwork.capsule_v5 
                || appDetails.artwork.capsule
            
            if (newHeaderUrl && !newHeaderUrl.includes('cdn.akamai.steamstatic.com')) {
                if (!game.artwork) {
                    game.artwork = {
                        icon: '',
                        logo: '',
                        header: '',
                        library: ''
                    }
                }
                game.artwork.header = newHeaderUrl
                updatedCount++
            }
        }
        
        SteamApiClient.logger.info(`Updated artwork URLs for ${updatedCount}/${steamUser.games.length} games from cache`)
    }
    
    /**
     * Hydrate batch metadata (categories/genres/artwork) for ALL games in cache
     * This ensures IndexedDB has complete data for all games without display limits
     * 
     * @param steamUser - Steam user data containing games list
     * @param options - Optional progress callback
     */
    public async hydrateAllGamesMetadata(
        steamUser: SteamUser,
        options: { onProgress?: (current: number, total: number) => void } = {}
    ): Promise<void> {
        const { onProgress } = options
        const appids = steamUser.games.map(g => g.appid)
        
        SteamApiClient.logger.debug(`Checking batch metadata for ${appids.length} games`)
        
        // Check which games need batch data
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        const uncachedAppids = appids.filter(id => {
            const cached = cachedAppDetails.get(id)
            if (!cached) return true
            
            // Check if we have usable metadata - accept if we have categories, genres, OR valid artwork
            const hasCategories = cached.categories && Array.isArray(cached.categories) && cached.categories.length > 0
            const hasGenres = cached.genres && Array.isArray(cached.genres) && cached.genres.length > 0
            const hasArtwork = cached.artwork?.header && !cached.artwork.header.includes('cdn.akamai.steamstatic.com')
            
            // Need at least one of these to consider it cached
            const isValid = hasCategories || hasGenres || hasArtwork
            
            return !isValid
        })
        
        if (uncachedAppids.length === 0) {
            SteamApiClient.logger.debug(`All ${appids.length} games already have complete metadata`)
            onProgress?.(appids.length, appids.length)
            return
        }
        
        SteamApiClient.logger.info(`Fetching batch metadata for ${uncachedAppids.length} games (${appids.length - uncachedAppids.length} already cached)`)
        
        // Fetch missing batch data
        try {
            const batchResponses = await this.batchClient.fetchBatch(uncachedAppids, {
                batchSize: 25, // Reduced to 25 to stay under Lambda 30s timeout (10 at a time internally = ~20-25s)
                onProgress: (fetched, total) => {
                    // Progress: already cached + newly fetched out of total needed
                    const totalProcessed = (appids.length - uncachedAppids.length) + fetched
                    onProgress?.(totalProcessed, appids.length)
                }
            })
            
            // Save to IndexedDB
            const fetchedAppDetails = new Map<number, AppDetailsData>()
            for (const [appid, response] of batchResponses.entries()) {
                fetchedAppDetails.set(appid, response.data)
            }
            
            if (fetchedAppDetails.size > 0) {
                await this.appDetailsCache.setMany(fetchedAppDetails)
                SteamApiClient.logger.info(`Saved ${fetchedAppDetails.size} game metadata entries to IndexedDB`)
            }
        } catch (error) {
            SteamApiClient.logger.error('Batch metadata hydration failed:', error)
        }
    }
    
    public async loadGamesProgressively(
        steamUser: SteamUser,
        options: {
            maxGames?: number
            onProgress?: (current: number, total: number) => void
            onGameLoaded?: (game: SteamGame) => void
        } = {}
    ): Promise<SteamGame[]> {
        const { maxGames = 10, onProgress, onGameLoaded } = options
        
        // Sort games by playtime
        const sortedGames = [...steamUser.games]
            .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
            .slice(0, maxGames)

        const results: SteamGame[] = []
        
        // Extract app IDs for batch fetching
        const appids = sortedGames.map(g => g.appid)
        
        SteamApiClient.logger.debug(`Loading ${appids.length} games with batch API`)
        
        // Check client-side cache and fetch missing/incomplete details
        const cachedAppDetails = await this.appDetailsCache.getMany(appids)
        
        // Filter for appids that need (re)fetching:
        // 1. Not in cache at all, OR
        // 2. In cache but missing critical metadata (categories/genres from batch API)
        const uncachedAppids = appids.filter(id => {
            const cached = cachedAppDetails.get(id)
            if (!cached) return true // Not cached at all
            
            // Check if cached data has the metadata we need from batch API
            const hasCategories = cached.categories && Array.isArray(cached.categories) && cached.categories.length > 0
            const hasGenres = cached.genres && Array.isArray(cached.genres) && cached.genres.length > 0
            
            // If missing both categories and genres, we need to fetch from batch API
            return !hasCategories && !hasGenres
        })
        
        let fetchedAppDetails = new Map<number, AppDetailsData>()
        
        const cacheHits = appids.length - uncachedAppids.length
        if (cacheHits > 0 && uncachedAppids.length > 0) {
            SteamApiClient.logger.debug(`${cacheHits} games have complete metadata, fetching batch data for ${uncachedAppids.length} games`)
        } else if (uncachedAppids.length === appids.length) {
            SteamApiClient.logger.debug(`No complete metadata cached, fetching batch data for all ${uncachedAppids.length} games`)
        } else if (uncachedAppids.length === 0) {
            SteamApiClient.logger.debug(`All ${appids.length} games have complete metadata in cache`)
        }
        
        if (uncachedAppids.length > 0) {
            
            try {
                const batchResponses = await this.batchClient.fetchBatch(uncachedAppids, {
                    batchSize: 50,
                    onProgress: (fetched, total) => {
                        const totalProcessed = cachedAppDetails.size + fetched
                        onProgress?.(totalProcessed, appids.length)
                    }
                })
                
                // Extract and cache the newly fetched app details
                for (const [appid, response] of batchResponses.entries()) {
                    fetchedAppDetails.set(appid, response.data)
                }
                
                if (fetchedAppDetails.size > 0) {
                    await this.appDetailsCache.setMany(fetchedAppDetails)
                }
            } catch (error) {
                console.error('❌ [SteamApiClient] Batch fetch failed:', error)
            }
        }
        
        // Combine cached and fetched app details (fetchedAppDetails overrides cachedAppDetails)
        const allAppDetails = new Map<number, AppDetailsData>([...cachedAppDetails, ...fetchedAppDetails])
        
        // Debug: Log what we're actually using
        if (fetchedAppDetails.size > 0) {
                const sample = Array.from(fetchedAppDetails.entries())[0]
            SteamApiClient.logger.debug(`Sample fetched data for ${sample[0]}: header=${sample[1].artwork?.header}`)
        }
        
        // Process games with available app details
        for (const game of sortedGames) {
            const appDetails = allAppDetails.get(game.appid)
            
            // Log first game to trace artwork URL selection
            if (game.appid === sortedGames[0].appid) {
                SteamApiClient.logger.debug(`Processing first game ${game.name} (${game.appid}) - hasDetails=${!!appDetails}`)
            }
            
            // Use batch artwork if available (priority: header → capsule_v5 → capsule)
            const headerUrl = appDetails?.artwork?.header 
                || appDetails?.artwork?.capsule_v5 
                || appDetails?.artwork?.capsule
                || `https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg`
            
            if (game.appid === sortedGames[0].appid) {
                SteamApiClient.logger.debug(`Selected header for ${game.name}: ${headerUrl}`)
            }
            
            const enhancedGame: SteamGame = {
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
                }
            }
            
            if (game.appid === sortedGames[0].appid) {
                SteamApiClient.logger.debug(`Enhanced game created for ${game.name} - header=${enhancedGame.artwork.header}`)
            }
            
            this.cache.set(`game_${game.appid}`, enhancedGame)
            
            results.push(enhancedGame)
            onGameLoaded?.(enhancedGame)
        }
        
        SteamApiClient.logger.info(`Loaded ${results.length}/${sortedGames.length} games (${cachedAppDetails.size} from cache, ${fetchedAppDetails.size} from API)`)
        
        return results
    }

    /**
     * Image methods (delegate to ImageManager)
     */
    public async downloadGameImage(url: string): Promise<Blob | null> {
        return this.images.downloadImage(url)
    }

    public async downloadGameArtwork(game: SteamGame): Promise<Record<string, Blob | null>> {
        return this.images.downloadGameArtwork(game.artwork)
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

    /**
     * Image cache management
     */
    public async getImageCacheStats() {
        return this.images.getStats()
    }

    public async getAppDetailsCacheStats() {
        return this.appDetailsCache.getStats()
    }

    public async clearCache(): Promise<void> {
        this.cache.clear()
        await this.images.clearCache()
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
