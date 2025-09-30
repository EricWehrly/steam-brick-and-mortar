/**
 * Simplified Steam API Client using composition layers
 */

import { HttpClient } from './http/HttpClient'
import { CacheManager } from './cache/SimpleCacheManager'
import { RateLimiter } from './rate-limit/RateLimiter'
import { ImageManager } from './images/ImageManager'

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
    private http: HttpClient
    private cache: CacheManager
    private rateLimiter: RateLimiter
    private images: ImageManager

    constructor(apiBaseUrl = 'https://steam-api-dev.wehrly.com') {
        // Initialize all layers
        this.http = new HttpClient({ baseUrl: apiBaseUrl })
        this.cache = new CacheManager({ cachePrefix: 'steam_api_' })
        this.rateLimiter = new RateLimiter({ requestsPerSecond: 4 })
        this.images = new ImageManager()
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
            console.log(`📋 Using cached vanity URL resolution for: ${cleanVanityUrl}`)
            return cached
        }
        
        // Make API request
        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`
        console.log(`🔍 Resolving vanity URL: "${vanityUrl}" -> "${cleanVanityUrl}" -> endpoint: ${endpoint}`)
        
        try {
            const response = await this.http.makeRequest<SteamResolveResponse>(endpoint)
            console.log('✅ Vanity URL resolved successfully:', response)
            
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
            console.log(`📋 Using cached games data for Steam ID: ${steamId}`)
            return cached
        }
        
        // Make API request
        const endpoint = `/games/${encodeURIComponent(steamId)}`
        console.log(`🎮 Fetching games for Steam ID: ${steamId}`)
        
        try {
            const response = await this.http.makeRequest<SteamUser>(endpoint)
            console.log(`✅ Fetched ${response.game_count} games for user ${response.vanity_url || steamId}`)
            
            if (response.game_count === 0) {
                console.warn('⚠️ User has 0 games - this might indicate privacy settings or an empty library')
            }
            
            // Cache the result
            this.cache.set(cacheKey, response)
            
            return response
        } catch (error) {
            console.error('❌ Failed to fetch user games:', error)
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
        
        for (let i = 0; i < sortedGames.length; i++) {
            const game = sortedGames[i]
            
            try {
                const enhancedGame = await this.getGameDetails(game)
                results.push(enhancedGame)
                onGameLoaded?.(enhancedGame)
                onProgress?.(i + 1, sortedGames.length)
            } catch (error) {
                console.warn(`Failed to load game ${game.name}:`, error)
            }
        }
        
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
     * Image cache management
     */
    public async getImageCacheStats() {
        return this.images.getStats()
    }

    public async clearImageCache(): Promise<void> {
        return this.images.clearCache()
    }

    public async getAllCachedImageUrls(): Promise<string[]> {
        return await this.images.getAllCachedImageUrls()
    }

    public async getCachedImageBlob(url: string): Promise<Blob | null> {
        return await this.images.getCachedImageBlob(url)
    }

    /**
     * Cache management
     */
    public async clearCache(): Promise<void> {
        this.cache.clear()
        await this.images.clearCache()
    }

    public getCacheStats() {
        return this.cache.getStats()
    }
    
    /**
     * Check if cache contains specific key
     */
    public hasCached(key: string): boolean {
        return this.cache.get(key) !== null
    }
    
    /**
     * Get cached item (for internal use)
     */
    public getCached<T>(key: string): T | null {
        return this.cache.get<T>(key)
    }

    /**
     * Get all cache keys (for inspection/management)
     */
    public getAllCacheKeys(): string[] {
        return this.cache.getAllKeys()
    }

    /**
     * Get cached users efficiently (optimized implementation)
     */
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
