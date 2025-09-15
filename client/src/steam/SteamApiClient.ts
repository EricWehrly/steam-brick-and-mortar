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
 */
export class SteamApiClient {
    private http: HttpClient
    private cache: CacheManager
    private rateLimiter: RateLimiter
    private images: ImageManager
    
    // Cached methods - these are the actual methods that get called
    public getUserGames: (steamId: string) => Promise<SteamUser>
    public resolveVanityUrl: (vanityUrl: string) => Promise<SteamResolveResponse>
    public getGameDetails: (game: SteamGame) => Promise<SteamGame>

    constructor(apiBaseUrl = 'https://steam-api-dev.wehrly.com') {
        // Initialize all layers
        this.http = new HttpClient({ baseUrl: apiBaseUrl })
        this.cache = new CacheManager({ cachePrefix: 'steam_api_' })
        this.rateLimiter = new RateLimiter({ requestsPerSecond: 4 })
        this.images = new ImageManager()
        
        // Create cached versions of methods
        this.getUserGames = this.cache.withCache(
            this.rawGetUserGames.bind(this),
            (steamId: string) => `games_${steamId}`
        )
        
        this.resolveVanityUrl = this.cache.withCache(
            this.rawResolveVanityUrl.bind(this),
            (vanityUrl: string) => `resolve_${vanityUrl.toLowerCase()}`
        )
        
        this.getGameDetails = this.cache.withCache(
            this.rateLimiter.limited(this.rawGetGameDetails.bind(this)),
            (game: SteamGame) => `game_${game.appid}`
        )
    }

    /**
     * Raw methods - these do the actual work
     */
    private async rawResolveVanityUrl(vanityUrl: string): Promise<SteamResolveResponse> {
        if (!vanityUrl || vanityUrl.trim().length === 0) {
            throw new Error('Vanity URL cannot be empty')
        }

        const cleanVanityUrl = vanityUrl.trim().toLowerCase()
        const endpoint = `/resolve/${encodeURIComponent(cleanVanityUrl)}`
        
        console.log(`🔍 Resolving vanity URL: "${vanityUrl}" -> "${cleanVanityUrl}" -> endpoint: ${endpoint}`)
        
        try {
            const response = await this.http.makeRequest<SteamResolveResponse>(endpoint)
            console.log('✅ Vanity URL resolved successfully:', response)
            return response
        } catch (error) {
            console.error('❌ Failed to resolve vanity URL:', error)
            throw error
        }
    }

    private async rawGetUserGames(steamId: string): Promise<SteamUser> {
        if (!steamId || steamId.trim().length === 0) {
            throw new Error('Steam ID cannot be empty')
        }

        const endpoint = `/games/${encodeURIComponent(steamId)}`
        
        console.log(`🎮 Fetching games for Steam ID: ${steamId}`)
        
        try {
            const response = await this.http.makeRequest<SteamUser>(endpoint)
            console.log(`✅ Fetched ${response.game_count} games for user ${response.vanity_url || steamId}`)
            
            if (response.game_count === 0) {
                console.warn('⚠️ User has 0 games - this might indicate privacy settings or an empty library')
            }
            
            return response
        } catch (error) {
            console.error('❌ Failed to fetch user games:', error)
            throw error
        }
    }

    private async rawGetGameDetails(game: SteamGame): Promise<SteamGame> {
        // Enhance game with artwork URLs - handle missing image URLs gracefully
        const enhancedGame: SteamGame = {
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
}

// Export a default instance for convenience
export const steamApi = new SteamApiClient()
